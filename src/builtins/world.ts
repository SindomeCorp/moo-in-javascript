import type { Evaluation } from '../runtime/suspension.js';
import { serviceBuiltins, invokeServiceBuiltin } from './services.js';
import { invokeSqliteBuiltin } from './sqlite.js';
import { connectionBuiltins, invokeConnectionBuiltin } from './connections.js';
import { invokeFileBuiltin } from './files.js';
import { fold, truth } from '../values/operations.js';
import { builtinRoute, checkBuiltinArity } from './catalog.js';
import type { Execution } from '../runtime/execution.js';
import { fail } from '../runtime/errors.js';
import { moo, type MooValue } from '../values/index.js';
import { prepositionGroups, type VerbData } from '../world/index.js';

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
export function *invokeWorldBuiltin(name: string, args: MooValue[], execution: Execution): Evaluation<MooValue | undefined> {
  if (builtinRoute(name, execution.world.profile) !== 'world') return undefined;
  checkBuiltinArity(name, args.length, execution.world.profile);
  if(serviceBuiltins.some(b=>b.name===name))return invokeServiceBuiltin(name,args,execution);
  if(connectionBuiltins.some(b=>b.name===name))return invokeConnectionBuiltin(name,args,execution);
  if(name.startsWith('sqlite_'))return invokeSqliteBuiltin(name,args,execution);
  if(name.startsWith('file_'))return invokeFileBuiltin(name,args,execution);
  const { world, budget } = execution, a = args[0]!, b = args[1]!, c = args[2]!;
  const zero = () => moo.int(0);
  switch (name) {
    case 'recreate': {const id=world.recreate(object(a),object(b),c?object(c):execution.current.programmer,budget);(yield* execution.initialize(id));return moo.object(id);}
    case 'renumber': return moo.object(world.renumber(object(a),budget));
    case 'reset_max_object': world.resetMaxObject(budget);return zero();
    case 'occupants': {
      const values=list(a),parents=b?(b.type==='list'?b.value.map(object):[object(b)]):[];
      if(c&&c.type!=='int'||args[3]&&args[3].type!=='int')fail('E_TYPE');
      for(const v of values)if(v.type!=='object'||!world.valid(v.value))fail('E_INVARG');
      const filtered=values.filter(v=>{budget.step();const id=object(v);let parentMatches=true;
        if(b){const ancestry=world.ancestors(id,budget);budget.step(parents.length*ancestry.length);parentMatches=parents.some(p=>ancestry.some(o=>o.id===p));if(args[3]&&truth(args[3]))parentMatches=!parentMatches;}
        return parentMatches&&((b&&(!c||!truth(c)))||!!world.get(id).player);
      });budget.allocate(filtered.length);return moo.list(filtered);
    }
    case 'locations': {
      const id=object(a);world.get(id,true);const stop=b?object(b):0n;if(c&&c.type!=='int')fail('E_TYPE');const result:MooValue[]=[];let location=world.get(id).location??-1n;
      while(location!==-1n){budget.step();if(stop!==0n&&(c&&truth(c)?world.ancestors(location,budget).some(o=>o.id===stop):location===stop))break;budget.allocate(1);result.push(moo.object(location));location=world.get(location).location??-1n;}
      return moo.list(result);
    }
    case 'recycled_objects': {const result:MooValue[]=[];for(let id=0n;id<world.nextId;id++){budget.step();if(!world.valid(id)){budget.allocate(1);result.push(moo.object(id));}}return moo.list(result);}
    case 'next_recycled_object': {let id=a?object(a):0n;if(id<0n||id>=world.nextId)fail('E_INVARG');const objects=world.objects().map(o=>o.id).sort((a,b)=>a<b?-1:1);budget.step(objects.length);for(const allocated of objects){if(allocated<id)continue;if(allocated>id)break;id++;}return id<world.nextId?moo.object(id):zero();}
    case 'players': {const objects=world.objects();budget.step(objects.length);const players=objects.filter(o=>o.player);budget.allocate(players.length);players.sort((a,b)=>a.id<b.id?-1:1);return moo.list(players.map(o=>moo.object(o.id)));}
    case 'is_player': {const id=object(a);return moo.int(world.valid(id)&&world.get(id).player?1:0);}
    case 'set_player_flag': world.setPlayer(object(a),truth(b),budget);return zero();
    case 'chparent': world.reparent(object(a),object(b),budget);return zero();
    case 'move': {if(c&&c.type!=='int')fail('E_TYPE');const position=c?Number(c.value):0;if(!Number.isSafeInteger(position)||position<0)fail('E_INVARG');return (yield* execution.move(object(a),object(b),position));}
    case 'set_task_perms': {const id=object(a),current=execution.current.programmer;if(id!==current&&(!world.valid(current)||!world.get(current).flags.wizard))fail('E_PERM');execution.current.programmer=id;return zero();}
    case 'call_function': return (yield* execution.dynamicBuiltin(string(a),args.slice(1)));
    case 'eval': return (yield* execution.evaluateSource(args.map(string)));
    case 'ticks_left': return moo.int(budget.remainingSteps());
    case 'suspend': {
      if (a.type !== 'int' && a.type !== 'float') fail('E_TYPE');
      if (a.type === 'float' && execution.world.profile !== 'toaststunt') fail('E_TYPE');
      const seconds = Number(a.value);
      if (!Number.isFinite(seconds) || seconds < 0) fail('E_INVARG');
      budget.suspend();
      yield { milliseconds: Math.min(seconds, 5) * 1000 };
      budget.replenish();
      return zero();
    }
    case 'task_id': return moo.int(execution.taskId);
    case 'task_local': return execution.taskLocal;
    case 'set_task_local': execution.taskLocal=a;return zero();
    case 'task_perms': return moo.object(execution.current.programmer);
    case 'caller_perms': return moo.object(execution.frames.at(-2)?.programmer??-1n);
    case 'callers': {
      const frames=execution.frames.slice(0,-1).reverse();budget.allocate(frames.length*7);
      return moo.list(frames.map(f=>moo.list([moo.object(f.this),moo.string(f.verb),moo.object(f.programmer),moo.object(f.definer),moo.object(f.player),...(a&&truth(a)?[moo.int((f.span?.start.row??0)+1)]:[])])));
    }
    case 'parents': {const parent=world.get(object(a)).parent;budget.allocate(1);return moo.list(parent===-1n?[]:[moo.object(parent)]);}
    case 'ancestors': {
      world.get(object(a));const ancestors=world.ancestors(object(a),budget);if(!b||!truth(b))ancestors.shift();budget.allocate(ancestors.length);return moo.list(ancestors.map(o=>moo.object(o.id)));
    }
    case 'descendants': {
      const id=object(a);world.get(id);const result: MooValue[]=[];
      const visit=(parent:bigint):void=>{budget.enter();try{budget.step(world.objects().length);for(const child of world.children(parent)){budget.allocate(1);result.push(moo.object(child.id));visit(child.id);}}finally{budget.leave();}};
      if(b&&truth(b)){budget.allocate(1);result.push(a);}visit(id);return moo.list(result);
    }
    case 'isa': {
      const id=object(a),candidates=b.type==='list'?b.value.map(object):[object(b)];if(c&&c.type!=='int')fail('E_TYPE');
      const ancestors=world.valid(id)?world.ancestors(id,budget):[];
      let match:bigint|undefined;for(const candidate of candidates){budget.step(ancestors.length);if(ancestors.some(o=>o.id===candidate)){match=candidate;break;}}
      return c&&truth(c)?moo.object(match??-1n):moo.int(match===undefined?0:1);
    }
    case 'owned_objects': case 'locate_by_name': {
      const owner=name==='owned_objects'?object(a):undefined;
      if(owner!==undefined)world.get(owner,true);else string(a);if(b&&b.type!=='int')fail('E_TYPE');
      const needle=owner===undefined?(b&&truth(b)?string(a):fold(string(a))):'';
      const objects=world.objects();budget.step(objects.length);const matches=objects.filter(o=>{
        if(owner!==undefined)return o.owner===owner;budget.step(o.name.length+needle.length);return (b&&truth(b)?o.name:fold(o.name)).includes(needle);
      });budget.allocate(matches.length);matches.sort((x,y)=>x.id<y.id?-1:x.id>y.id?1:0);return moo.list(matches.map(o=>moo.object(o.id)));
    }
    case 'respond_to': {const id=object(a);world.get(id);const found=world.findVerb(id,string(b),budget);budget.allocate(2);return found?moo.list([moo.object(found.definer),moo.string(found.verb.names)]):zero();}
    case 'object_bytes': world.get(object(a), true); return zero(); // Fixed accounting stub; validate the object first.
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
      let owner = args.length === 2 ? object(b) : execution.current.programmer;
      if (owner === -1n) owner = world.nextId;
      const id=world.addObject({ parent, owner }, budget);(yield* execution.initialize(id));return moo.object(id);
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
