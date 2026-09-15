import { HostError, assertProfile, type Profile } from '../parser/index.js';

export const errorCodes = ['E_NONE', 'E_TYPE', 'E_DIV', 'E_PERM', 'E_PROPNF', 'E_VERBNF',
  'E_VARNF', 'E_INVIND', 'E_RECMOVE', 'E_MAXREC', 'E_RANGE', 'E_ARGS', 'E_NACC',
  'E_INVARG', 'E_QUOTA', 'E_FLOAT'] as const;
export type ErrorCode = typeof errorCodes[number];
export type MooValue =
  | Readonly<{ type: 'int'; value: bigint }>
  | Readonly<{ type: 'float'; value: number }>
  | Readonly<{ type: 'string'; value: string }>
  | Readonly<{ type: 'object'; value: bigint }>
  | Readonly<{ type: 'error'; value: ErrorCode }>
  | Readonly<{ type: 'list'; value: readonly MooValue[] }>
  | Readonly<{ type: 'map'; value: readonly (readonly [MooValue, MooValue])[] }>;

export type EncodedValue =
  | { type: 'int' | 'object'; value: string }
  | { type: 'float'; value: number | '-0' }
  | { type: 'string'; value: string }
  | { type: 'error'; value: ErrorCode }
  | { type: 'list'; value: EncodedValue[] }
  | { type: 'map'; value: [EncodedValue, EncodedValue][] };

const managed = new WeakSet<object>();
function mapKeyCompare(a: MooValue, b: MooValue): number {
  const codes = { int: 0, object: 1, error: 3, float: 9, string: 130, list: 132, map: 138 };
  if (a.type !== b.type) return codes[a.type] - codes[b.type];
  if (a.type === 'string' && b.type === 'string') {
    const fold = (s: string) => s.replace(/[A-Z]/g, c => c.toLowerCase());
    const x = fold(a.value), y = fold(b.value); return x < y ? -1 : x > y ? 1 : 0;
  }
  if (a.type === 'error' && b.type === 'error') return errorCodes.indexOf(a.value) - errorCodes.indexOf(b.value);
  return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
}
function owned<T extends MooValue>(value: T): T { managed.add(value); return Object.freeze(value); }
function requireManaged(value: MooValue): void {
  if (typeof value !== 'object' || value === null || !managed.has(value)) {
    throw new HostError('Use moo constructors or decodeValue to create MOO values');
  }
}
function integer(value: number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new HostError('Integer requires BigInt or a safe integer');
  return BigInt(value);
}

/** Immutable constructors; nested collections cannot acquire host array aliases. */
export const moo = Object.freeze({
  int(value: bigint | number): MooValue { return owned({ type: 'int', value: integer(value) }); },
  float(value: number): MooValue {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new HostError('MOO floats must be finite');
    return owned({ type: 'float', value });
  },
  string(value: string): MooValue {
    if (typeof value !== 'string') throw new HostError('MOO string requires string data');
    return owned({ type: 'string', value });
  },
  object(value: bigint | number): MooValue { return owned({ type: 'object', value: integer(value) }); },
  error(value: ErrorCode): MooValue {
    if (!errorCodes.includes(value)) throw new HostError('Unknown MOO error code');
    return owned({ type: 'error', value });
  },
  list(value: readonly MooValue[]): MooValue {
    if (!Array.isArray(value)) throw new HostError('MOO list requires an array');
    for (const entry of value) requireManaged(entry);
    return owned({ type: 'list', value: Object.freeze([...value]) });
  },
  map(value: readonly (readonly [MooValue, MooValue])[]): MooValue {
    if (!Array.isArray(value)) throw new HostError('MOO map requires entry pairs');
    const entries = value.map(pair => {
      if (!Array.isArray(pair) || pair.length !== 2) throw new HostError('MOO map requires entry pairs');
      requireManaged(pair[0]!); requireManaged(pair[1]!);
      if (pair[0]!.type === 'list' || pair[0]!.type === 'map') throw new HostError('Map keys must be scalar values');
      return Object.freeze([pair[0]!, pair[1]!] as const);
    });
    // Stable sort leaves equivalent keys in input order; keep the last spelling/value.
    entries.sort(([a], [b]) => mapKeyCompare(a, b));
    const canonical: (readonly [MooValue, MooValue])[] = [];
    for (const pair of entries) {
      if (canonical.length && mapKeyCompare(canonical.at(-1)![0], pair[0]) === 0) canonical[canonical.length - 1] = pair;
      else canonical.push(pair);
    }
    return owned({ type: 'map', value: Object.freeze(canonical) });
  },
});

export interface CodecOptions {
  profile: Profile;
  maxDepth?: number;
  maxValues?: number;
  maxStringUnits?: number;
}

function guard(options: CodecOptions) {
  assertProfile(options?.profile);
  const maxDepth = options.maxDepth ?? 100;
  const maxValues = options.maxValues ?? 100_000;
  const maxStringUnits = options.maxStringUnits ?? 1_000_000;
  for (const n of [maxDepth, maxValues, maxStringUnits]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new HostError('Codec limits must be nonnegative safe integers');
  }
  if (maxDepth > 256) throw new HostError('Codec maxDepth cannot exceed 256');
  let count = 0, units = 0;
  const bits = options.profile === 'lambdamoo' ? 32n : 64n;
  return {
    visit(depth: number) {
      if (depth > maxDepth || ++count > maxValues) throw new HostError('Value codec depth/count limit exceeded');
    },
    string(value: string) {
      units += value.length;
      if (units > maxStringUnits) throw new HostError('Value codec string limit exceeded');
    },
    number(value: bigint) {
      if (value < -(1n << (bits - 1n)) || value >= (1n << (bits - 1n))) throw new HostError('Integer/object ID outside profile range');
    },
  };
}

export function encodeValue(value: MooValue, options: CodecOptions): EncodedValue {
  const budget = guard(options);
  function encode(value: MooValue, depth: number): EncodedValue {
    requireManaged(value);
    budget.visit(depth);
    switch (value.type) {
      case 'int': case 'object': budget.number(value.value); return { type: value.type, value: String(value.value) };
      case 'float': return { type: 'float', value: Object.is(value.value, -0) ? '-0' : value.value };
      case 'string': budget.string(value.value); return { type: 'string', value: value.value };
      case 'error': return { type: 'error', value: value.value };
      case 'list': return { type: 'list', value: value.value.map(entry => encode(entry, depth + 1)) };
      case 'map':
        if (options.profile !== 'toaststunt') throw new HostError('Maps require ToastStunt profile');
        return { type: 'map', value: value.value.map(([key, entry]) => [encode(key, depth + 1), encode(entry, depth + 1)]) };
    }
  }
  return encode(value, 0);
}

export function decodeValue(input: unknown, options: CodecOptions): MooValue {
  const budget = guard(options);
  function decode(input: unknown, depth: number): MooValue {
    budget.visit(depth);
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
      || Object.keys(input).sort().join(',') !== 'type,value') throw new HostError('Invalid encoded value object');
    const { type, value } = input as { type: unknown; value: unknown };
    switch (type) {
      case 'int': case 'object': {
        if (typeof value !== 'string' || value.length > 20 || !/^(0|-?[1-9][0-9]*)$/.test(value)) throw new HostError('Invalid decimal integer');
        const parsed = BigInt(value); budget.number(parsed);
        return type === 'int' ? moo.int(parsed) : moo.object(parsed);
      }
      case 'float':
        if (value === '-0') return moo.float(-0);
        if (typeof value !== 'number') throw new HostError('Invalid float encoding');
        return moo.float(value);
      case 'string':
        if (typeof value !== 'string') throw new HostError('Invalid string encoding');
        budget.string(value); return moo.string(value);
      case 'error': return moo.error(value as ErrorCode);
      case 'list':
        if (!Array.isArray(value)) throw new HostError('Invalid list encoding');
        return moo.list(value.map(entry => decode(entry, depth + 1)));
      case 'map':
        if (options.profile !== 'toaststunt' || !Array.isArray(value)) throw new HostError('Invalid map encoding/profile');
        const entries = value.map(pair => {
          if (!Array.isArray(pair) || pair.length !== 2) throw new HostError('Invalid map entry');
          return [decode(pair[0], depth + 1), decode(pair[1], depth + 1)] as const;
        });
        const map = moo.map(entries);
        if (map.type !== 'map' || map.value.length !== entries.length) throw new HostError('Encoded map contains duplicate equivalent keys');
        return map;
      default: throw new HostError('Unknown encoded value tag');
    }
  }
  return decode(input, 0);
}
