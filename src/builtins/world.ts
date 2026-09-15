import type { Execution } from '../runtime/execution.js';
import { fail } from '../runtime/errors.js';
import { moo, type MooValue } from '../values/index.js';
import { prepositionGroups, type VerbData } from '../world/index.js';

const signatures: Record<string, readonly [number, number]> = {
  notify: [2, 2], valid: [1, 1], parent: [1, 1], children: [1, 1], create: [1, 2], recycle: [1, 1], max_object: [0, 0],
  properties: [1, 1], property_info: [2, 2], set_property_info: [3, 3], add_property: [4, 4], delete_property: [2, 2], clear_property: [2, 2], is_clear_property: [2, 2],
  verbs: [1, 1], add_verb: [3, 3], delete_verb: [2, 2], verb_info: [2, 2], set_verb_info: [3, 3], verb_args: [2, 2], set_verb_args: [3, 3], verb_code: [2, 4], set_verb_code: [3, 3],
};
function object(value: MooValue): bigint { if (value.type !== 'object') fail('E_TYPE'); return value.value; }
function string(value: MooValue): string { if (value.type !== 'string') fail('E_TYPE'); return value.value; }
function list(value: MooValue): readonly MooValue[] { if (value.type !== 'list') fail('E_TYPE'); return value.value; }
function descriptor(value: MooValue): string | bigint { if (value.type !== 'string' && value.type !== 'int') fail('E_TYPE'); return value.value; }
function info(value: MooValue, min: number, max = min): readonly MooValue[] {
  const values = list(value); if (values.length < min || values.length > max) fail('E_INVARG', 'Malformed metadata'); return values;
}
function verbInfo(value: MooValue): Pick<VerbData, 'owner' | 'perms' | 'names'> {
  const values = info(value, 3); return { owner: object(values[0]!), perms: string(values[1]!).toLowerCase(), names: string(values[2]!) };
}
function verbArgs(value: MooValue): readonly [string, string, string] {
  const values = info(value, 3); return [string(values[0]!), string(values[1]!), string(values[2]!)];
}
export function invokeWorldBuiltin(name: string, args: MooValue[], execution: Execution): MooValue | undefined {
  if (!Object.hasOwn(signatures, name)) return undefined;
  const [min, max] = signatures[name]!;
  if (args.length < min || args.length > max) fail('E_ARGS');
  const { world, budget } = execution, a = args[0]!, b = args[1]!, c = args[2]!;
  const zero = () => moo.int(0);
  switch (name) {
    case 'notify': return execution.notify(a, b);
    case 'valid': return moo.int(world.valid(object(a)) ? 1 : 0);
    case 'parent': return moo.object(world.get(object(a)).parent);
    case 'children': {
      budget.step(world.objects().length); const children = world.children(object(a)); budget.allocate(children.length);
      return moo.list(children.map(child => moo.object(child.id)));
    }
    case 'max_object': return moo.object(world.nextId - 1n);
    case 'create': {
      const parent = object(a); if (parent !== -1n) world.get(parent);
      if (parent !== -1n && world.findVerb(parent, 'initialize', budget)) fail('E_INVARG', 'initialize lifecycle hooks are not supported yet');
      let owner = args.length === 2 ? object(b) : execution.current.programmer;
      if (owner === -1n) owner = world.nextId;
      return moo.object(world.addObject({ parent, owner }, budget));
    }
    case 'recycle': {
      const id = object(a); world.get(id);
      if (world.findVerb(id, 'recycle', budget)) fail('E_INVARG', 'recycle lifecycle hooks are not supported yet');
      world.recycle(id, budget); return zero();
    }
    case 'properties': {
      const properties = world.get(object(a)).properties.filter(prop => prop.origin === object(a)); budget.allocate(properties.length);
      return moo.list(properties.map(prop => moo.string(prop.name)));
    }
    case 'property_info': {
      const prop = world.property(object(a), string(b)); return moo.list([moo.object(prop.owner), moo.string(prop.perms)]);
    }
    case 'set_property_info': {
      const values = info(c, 2, 3);
      world.setPropertyInfo(object(a), string(b), object(values[0]!), string(values[1]!), values[2] ? string(values[2]) : undefined, budget); return zero();
    }
    case 'add_property': {
      const values = info(args[3]!, 2);
      world.addProperty(object(a), string(b), c, object(values[0]!), string(values[1]!), budget); return zero();
    }
    case 'delete_property': world.deleteProperty(object(a), string(b), budget); return zero();
    case 'clear_property': world.clearProperty(object(a), string(b), budget); return zero();
    case 'is_clear_property': return moo.int(world.property(object(a), string(b)).value === null ? 1 : 0);
    case 'verbs': {
      const verbs = world.get(object(a)).verbs; budget.allocate(verbs.length);
      return moo.list(verbs.map(verb => moo.string(verb.names)));
    }
    case 'add_verb': world.addVerb(object(a), { ...verbInfo(b), args: verbArgs(c), source: '' }, budget); return zero();
    case 'delete_verb': world.deleteVerb(object(a), descriptor(b), budget); return zero();
    case 'verb_info': {
      const { verb } = world.ownVerb(object(a), descriptor(b));
      return moo.list([moo.object(verb.owner), moo.string(verb.perms), moo.string(verb.names)]);
    }
    case 'set_verb_info': world.setVerb(object(a), descriptor(b), verbInfo(c), budget); return zero();
    case 'verb_args': {
      const values = [...world.ownVerb(object(a), descriptor(b)).verb.args];
      values[1] = prepositionGroups.find(group => group.split('/').includes(values[1]!)) ?? values[1]!;
      return moo.list(values.map(moo.string));
    }
    case 'set_verb_args': world.setVerb(object(a), descriptor(b), { args: verbArgs(c) }, budget); return zero();
    case 'verb_code': {
      const { verb } = world.ownVerb(object(a), descriptor(b));
      for (const option of args.slice(2)) {
        if (option.type !== 'int') fail('E_TYPE');
        if (option.value !== 0n) fail('E_INVARG', 'verb_code pretty-print options are not supported; stored source is returned');
      }
      budget.allocate(verb.source.length);
      return moo.list((verb.source ? verb.source.split('\n') : []).map(moo.string));
    }
    case 'set_verb_code': {
      const id = object(a), desc = descriptor(b); world.ownVerb(id, desc);
      const lines = list(c).map(string);
      const units = lines.reduce((sum, line) => sum + line.length + 1, 0);
      budget.allocate(units); budget.step(units);
      const source = lines.join('\n'), compilation = execution.compile(source);
      if (!compilation.ok) {
        budget.allocate(compilation.diagnostics.reduce((sum, diagnostic) => sum + diagnostic.message.length, 0));
        return moo.list(compilation.diagnostics.map(diagnostic => moo.string(diagnostic.message)));
      }
      world.setVerb(id, desc, { source }, budget); return moo.list([]);
    }
  }
  return undefined;
}
