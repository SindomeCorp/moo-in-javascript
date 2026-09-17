import { clockBuiltins } from './clock.js';
import { cryptoBuiltins } from './crypto.js';
import { regexBuiltins } from './regex.js';
import { codecs } from './codecs.js';
import { utilities } from './utilities.js';
import { checkBuiltinArity } from './catalog.js';
import { functionInfo } from './function-info.js';
import type { Profile } from '../parser/index.js';
import type { Budget } from '../runtime/budget.js';
import { fail, MooError } from '../runtime/errors.js';
import { moo, type MooValue } from '../values/index.js';
import { length, typeNumbers, equal, compare, truth } from '../values/operations.js';
import { format } from '../values/format.js';

interface BuiltinContext { profile: Profile; budget: Budget }
interface Builtin { invoke(args: MooValue[], context: BuiltinContext): MooValue }
const registry = new Map<string, Builtin>([
  ...[...utilities, ...codecs, ...regexBuiltins, ...cryptoBuiltins, ...clockBuiltins].map(utility => [utility.name, { invoke: utility.invoke }] as [string, Builtin]),
  // Deliberate compatibility stub: do not present JS heap/JSON sizes as MOO bytes.
  ['value_bytes', { invoke: () => moo.int(0) }],
  ['function_info', { invoke: (args, { profile, budget }) => functionInfo(args, profile, budget) }],
  ...(['index', 'rindex'] as const).map((name): [string, Builtin] => [name, { invoke: ([source, needle, caseMatters, offset], { profile, budget }) => {
      if (offset && profile === 'lambdamoo') fail('E_ARGS');
      if (source!.type !== 'string' || needle!.type !== 'string' || (offset && offset.type !== 'int')) fail('E_TYPE');
      const shift = offset?.value ?? 0n;
      const reverse = name === 'rindex';
      if ((reverse && shift > 0n) || (!reverse && shift < 0n)) fail('E_INVARG');
      // Never reproduce the reference's out-of-bounds C pointer arithmetic.
      if (shift > BigInt(source!.value.length) || shift < -BigInt(source!.value.length)) fail('E_INVARG');
      const start = reverse ? 0 : Number(shift);
      const end = source!.value.length + (reverse ? Number(shift) : 0) - needle!.value.length;
      const sensitive = caseMatters !== undefined && truth(caseMatters);
      const char = (text: string, at: number) => {
        const code = text.charCodeAt(at);
        return !sensitive && code >= 65 && code <= 90 ? code + 32 : code;
      };
      for (let at = reverse ? end : start; at >= start && at <= end; at += reverse ? -1 : 1) {
        budget.step();
        let matches = true;
        for (let i = 0; i < needle!.value.length; i++) {
          budget.step();
          if (char(source!.value, at + i) !== char(needle!.value, i)) { matches = false; break; }
        }
        if (matches) return moo.int(at - start + 1);
      }
      return moo.int(0);
    },
  }]),
  ['length', { invoke: ([value]) => moo.int(length(value!)) }],
  ['typeof', { invoke: ([value]) => moo.int(typeNumbers[value!.type]) }],
  ['equal', { invoke: ([a, b], { budget }) => moo.int(equal(a!, b!, budget, true) ? 1 : 0) }],
  ['tostr', { invoke: (args, { budget }) => moo.string(args.map(value => format(value, false, budget)).join('')) }],
  ['toliteral', { invoke: ([value], { budget }) => moo.string(format(value!, true, budget)) }],
  ['raise', { invoke: ([code, message, value]) => {
    if (code!.type !== 'error' || (message && message.type !== 'string')) fail('E_TYPE');
    throw new MooError(code!.value, message?.value, value);
  } }],
  ...(['mapkeys', 'mapvalues'] as const).map((name): [string, Builtin] => [name, {
    invoke: ([value, ...keys], { profile, budget }) => {
      if (profile !== 'toaststunt') fail('E_INVARG', `Host built-in ${name} is unavailable in ${profile}`);
      if (value!.type !== 'map') fail('E_TYPE');
      if (keys.length) {
        budget.allocate(keys.length);
        return moo.list(keys.map(key => {
          if (key.type === 'list' || key.type === 'map') fail('E_TYPE');
          const pair = value!.value.find(([candidate]) => equal(candidate, key, budget, true));
          if (!pair) fail('E_RANGE');
          return pair[1];
        }));
      }
      budget.allocate(value!.value.length);
      return moo.list(value!.value.map(pair => pair[name === 'mapkeys' ? 0 : 1]));
    },
  }]),
  ['maphaskey', { invoke: ([map, key, caseMatters], { profile, budget }) => {
    if (profile !== 'toaststunt') fail('E_INVARG', 'Host built-in maphaskey is unavailable in lambdamoo');
    if (map!.type !== 'map' || key!.type === 'list' || key!.type === 'map' || (caseMatters && caseMatters.type !== 'int')) fail('E_TYPE');
    return moo.int(map!.value.some(([candidate]) => equal(candidate, key!, budget, caseMatters?.value !== undefined && caseMatters.value !== 0n)) ? 1 : 0);
  } }],
  ['mapdelete', { invoke: ([map, key], { profile, budget }) => {
    if (profile !== 'toaststunt') fail('E_INVARG', 'Host built-in mapdelete is unavailable in lambdamoo');
    if (map!.type !== 'map') fail('E_TYPE');
    budget.allocate(map!.value.length * 2);
    let entries = [...map!.value];
    const keys = key!.type === 'list' ? key!.value : [key!];
    for (const keyValue of keys) {
      if (keyValue.type === 'list' || keyValue.type === 'map') fail('E_TYPE');
      const at = entries.findIndex(([candidate]) => compare(candidate, keyValue, budget, true) === 0);
      if (at < 0) {
        if (key!.type === 'list') throw new MooError('E_RANGE', `Key ${format(keyValue, true, budget)} not found in map`, keyValue);
        fail('E_RANGE');
      }
      budget.step(entries.length); entries.splice(at, 1);
    }
    return moo.map(entries);
  } }],
]);

export function invokeBuiltin(name: string, args: MooValue[], context: BuiltinContext): MooValue {
  const builtin = registry.get(name);
  if (!builtin) fail('E_INVARG', `Host built-in ${name} is not provided by this runtime`);
  checkBuiltinArity(name, args.length, context.profile);
  return builtin.invoke(args, context);
}
