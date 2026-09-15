import type { Profile } from '../parser/index.js';
import { moo, errorCodes, type MooValue } from './index.js';
import { fail } from '../runtime/errors.js';
import type { Budget } from '../runtime/budget.js';

export const typeNumbers = { int: 0, object: 1, string: 2, error: 3, list: 4, float: 9, map: 10 } as const;
export const fold = (s: string): string => s.replace(/[A-Z]/g, c => c.toLowerCase());
export function truth(v: MooValue): boolean {
  switch (v.type) {
    case 'int': return v.value !== 0n;
    case 'float': return v.value !== 0;
    case 'string': case 'list': case 'map': return v.value.length !== 0;
    default: return false;
  }
}
export function equal(a: MooValue, b: MooValue, budget: Budget, caseSensitive = false): boolean {
  const pending: [MooValue, MooValue][] = [[a, b]];
  while (pending.length) {
    budget.step();
    const [x, y] = pending.pop()!;
    if (x.type !== y.type) return false;
    if (x.type === 'string' && y.type === 'string') {
      budget.step(x.value.length + y.value.length);
      if ((caseSensitive ? x.value : fold(x.value)) !== (caseSensitive ? y.value : fold(y.value))) return false;
    } else if (x.type === 'list' && y.type === 'list') {
      if (x.value.length !== y.value.length) return false;
      budget.allocate(x.value.length);
      x.value.forEach((v, i) => pending.push([v, y.value[i]!]));
    } else if (x.type === 'map' && y.type === 'map') {
      if (x.value.length !== y.value.length) return false;
      budget.allocate(x.value.length * 2);
      x.value.forEach(([k, v], i) => pending.push([k, y.value[i]![0]], [v, y.value[i]![1]]));
    } else if (x.value !== y.value) return false;
  }
  return true;
}
export function compare(a: MooValue, b: MooValue, budget: Budget, mapKey = false): number {
  budget.step();
  if (a.type === 'list' || a.type === 'map' || b.type === 'list' || b.type === 'map') fail('E_TYPE');
  if (a.type !== b.type) {
    if (!mapKey) fail('E_TYPE');
    // ToastStunt's comparison uses internal type codes, including the string flag.
    const code = (v: MooValue) => v.type === 'string' ? 130 : typeNumbers[v.type];
    return code(a) - code(b);
  }
  let left: string | number | bigint = a.value, right: string | number | bigint = b.value;
  if (a.type === 'string' && b.type === 'string') {
    budget.step(a.value.length + b.value.length); left = fold(a.value); right = fold(b.value);
  } else if (a.type === 'error' && b.type === 'error') {
    left = errorCodes.indexOf(a.value); right = errorCodes.indexOf(b.value);
  }
  return left < right ? -1 : left > right ? 1 : 0;
}
export function wrap(value: bigint, profile: Profile): MooValue { return moo.int(BigInt.asIntN(profile === 'lambdamoo' ? 32 : 64, value)); }
export function unary(op: string, v: MooValue, profile: Profile): MooValue {
  if (op === '!') return moo.int(truth(v) ? 0 : 1);
  if (v.type !== 'int' && v.type !== 'float') fail('E_TYPE');
  if (op === '+') return v;
  if (op === '-') return v.type === 'int' ? wrap(-v.value, profile) : moo.float(-v.value);
  if (op === '~' && v.type === 'int') return wrap(~v.value, profile);
  return fail('E_TYPE');
}
export function binary(op: string, a: MooValue, b: MooValue, profile: Profile, budget: Budget): MooValue {
  if (op === '==' || op === '!=') return moo.int(equal(a, b, budget) === (op === '==') ? 1 : 0);
  if (['<', '<=', '>', '>='].includes(op)) {
    const c = compare(a, b, budget);
    return moo.int((op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0) ? 1 : 0);
  }
  if (op === 'in') {
    if (b.type === 'list' || (profile === 'toaststunt' && b.type === 'map')) {
      for (let i = 0; i < b.value.length; i++) if (equal(a, b.type === 'list' ? b.value[i]! : b.value[i]![1], budget)) return moo.int(i + 1);
      return moo.int(0);
    }
    if (profile === 'toaststunt' && b.type === 'string' && a.type === 'string') {
      budget.step(a.value.length + b.value.length);
      return moo.int(fold(b.value).indexOf(fold(a.value)) + 1);
    }
    return fail('E_TYPE');
  }
  if (op === '+' && a.type === 'string' && b.type === 'string') {
    budget.allocate(a.value.length + b.value.length); return moo.string(a.value + b.value);
  }
  if (a.type === 'int' && b.type === 'int') {
    const x = a.value, y = b.value;
    let result: bigint;
    switch (op) {
      case '+': result = x + y; break;
      case '-': result = x - y; break;
      case '*': result = x * y; break;
      case '/': if (y === 0n) fail('E_DIV'); result = x / y; break;
      case '%': if (y === 0n) fail('E_DIV'); result = profile === 'toaststunt' ? ((x % y) + y) % y : x % y; break;
      case '^': {
        if (y < 0n) {
          if (x === 0n) fail('E_DIV');
          // Preserve the pinned ToastStunt implementation's negative -1 parity.
          result = x === 1n ? 1n : x === -1n ? (profile === 'toaststunt' ? (y & 1n ? 1n : -1n) : (y & 1n ? -1n : 1n)) : 0n;
        } else {
          const bits = profile === 'lambdamoo' ? 32 : 64;
          let base = x, exponent = y; result = 1n;
          while (exponent) { budget.step(); if (exponent & 1n) result = BigInt.asIntN(bits, result * base); base = BigInt.asIntN(bits, base * base); exponent >>= 1n; }
        }
        break;
      }
      default: return fail('E_TYPE', `Unsupported integer operator ${op}`);
    }
    return wrap(result, profile);
  }
  if (a.type === 'float' && (b.type === 'float' || (op === '^' && b.type === 'int'))) {
    const x = a.value, y = Number(b.value);
    let result: number;
    switch (op) {
      case '+': result = x + y; break;
      case '-': result = x - y; break;
      case '*': result = x * y; break;
      case '/': if (y === 0) fail('E_DIV'); result = x / y; break;
      case '%': if (y === 0) fail('E_DIV'); result = profile === 'toaststunt' ? ((x % y) + y) % y : x % y; break;
      case '^': result = x ** y; break;
      default: return fail('E_TYPE');
    }
    if (Number.isNaN(result)) fail(profile === 'lambdamoo' ? 'E_INVARG' : 'E_FLOAT');
    if (!Number.isFinite(result)) fail('E_FLOAT');
    return moo.float(result);
  }
  return fail('E_TYPE');
}

export function length(value: MooValue): number {
  if (value.type !== 'list' && value.type !== 'string' && value.type !== 'map') fail('E_TYPE');
  return value.value.length;
}
function sequence(value: MooValue): asserts value is Extract<MooValue, { type: 'list' | 'string' }> {
  if (value.type !== 'list' && value.type !== 'string') fail('E_TYPE');
}
function integerIndex(value: MooValue): bigint { if (value.type !== 'int') fail('E_TYPE'); return value.value; }
export function index(value: MooValue, key: MooValue, budget: Budget): MooValue {
  if (value.type === 'map') {
    if (key.type === 'list' || key.type === 'map') fail('E_TYPE');
    for (const [k, v] of value.value) if (compare(k, key, budget, true) === 0) return v;
    return fail('E_RANGE');
  }
  sequence(value);
  const at = integerIndex(key);
  if (at < 1n || at > BigInt(value.value.length)) fail('E_RANGE');
  return value.type === 'string' ? moo.string(value.value[Number(at) - 1]!) : value.value[Number(at) - 1]!;
}
export function slice(value: MooValue, start: MooValue, end: MooValue, budget: Budget): MooValue {
  sequence(value);
  const low = integerIndex(start), high = integerIndex(end);
  if (low > high) return value.type === 'list' ? moo.list([]) : moo.string('');
  if (low < 1n || high > BigInt(value.value.length)) fail('E_RANGE');
  budget.allocate(Number(high - low + 1n));
  return value.type === 'list' ? moo.list(value.value.slice(Number(low) - 1, Number(high))) : moo.string(value.value.slice(Number(low) - 1, Number(high)));
}
export function mapSet(map: MooValue, key: MooValue, value: MooValue, budget: Budget): MooValue {
  if (map.type !== 'map' || key.type === 'list' || key.type === 'map') fail('E_TYPE');
  budget.allocate(map.value.length * 2 + 2);
  const entries = map.value.filter(([k]) => compare(k, key, budget, true) !== 0);
  entries.push([key, value]); entries.sort(([a], [b]) => compare(a, b, budget, true));
  return moo.map(entries);
}
export function replaceIndex(value: MooValue, key: MooValue, replacement: MooValue, budget: Budget): MooValue {
  if (value.type === 'map') return mapSet(value, key, replacement, budget);
  sequence(value);
  const at = integerIndex(key);
  if (at < 1n || at > BigInt(value.value.length)) fail('E_RANGE');
  budget.allocate(value.value.length);
  const i = Number(at) - 1;
  if (value.type === 'list') { const copy = [...value.value]; copy[i] = replacement; return moo.list(copy); }
  if (replacement.type !== 'string') fail('E_TYPE');
  if (replacement.value.length !== 1) fail('E_INVARG');
  return moo.string(value.value.slice(0, i) + replacement.value + value.value.slice(i + 1));
}
export function replaceSlice(value: MooValue, start: MooValue, end: MooValue, replacement: MooValue, budget: Budget): MooValue {
  sequence(value);
  if (replacement.type !== value.type) fail('E_TYPE');
  const low = integerIndex(start), high = integerIndex(end), size = BigInt(value.value.length);
  if (low > size + 1n || high < 0n) fail('E_RANGE');
  const before = low <= 1n ? 0 : Number(low - 1n), after = high >= size ? Number(size) : Number(high);
  if (value.type === 'list' && replacement.type === 'list') {
    budget.allocate(before + replacement.value.length + Number(size) - after);
    return moo.list([...value.value.slice(0, before), ...replacement.value, ...value.value.slice(after)]);
  }
  if (value.type === 'string' && replacement.type === 'string') {
    budget.allocate(before + replacement.value.length + Number(size) - after);
    return moo.string(value.value.slice(0, before) + replacement.value + value.value.slice(after));
  }
  return fail('E_TYPE');
}
