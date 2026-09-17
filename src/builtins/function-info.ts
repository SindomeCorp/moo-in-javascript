import { getBuiltinInfo, listBuiltins, type BuiltinInfo, type BuiltinValueType } from './catalog.js';
import { moo, type MooValue } from '../values/index.js';
import { typeNumbers } from '../values/operations.js';
import { fail } from '../runtime/errors.js';
import type { Profile } from '../parser/index.js';
import type { Budget } from '../runtime/budget.js';
function typeCode(types: readonly BuiltinValueType[]): number {
  if (types.length === 1 && types[0] !== 'any') return typeNumbers[types[0]!];
  return types.length === 2 && types.includes('int') && types.includes('float') ? -2 : -1;
}
export function functionInfo(args: MooValue[], profile: Profile, budget: Budget): MooValue {
  const describe = (info: BuiltinInfo): MooValue => {
    const parameters = info.maxArgs === null ? info.parameters.slice(0, info.minArgs) : info.parameters;
    budget.step(5 + info.name.length + parameters.reduce((n,p) => n + p.types.length,0));
    budget.allocate(6 + info.name.length + parameters.length);
    return moo.list([moo.string(info.name),moo.int(info.minArgs),moo.int(info.maxArgs ?? -1),moo.list(parameters.map(p => moo.int(typeCode(p.types))))]);
  };
  if (args.length) {
    const name = args[0]!;
    if (name.type !== 'string') fail('E_TYPE');
    budget.step(name.value.length);
    const info = getBuiltinInfo(name.value, { profile });
    if (!info) fail('E_INVARG', 'Unknown builtin: ' + name.value);
    return describe(info);
  }
  const entries = listBuiltins({ profile });
  budget.allocate(entries.length + 1);
  return moo.list(entries.map(describe));
}
