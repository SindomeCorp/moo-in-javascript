import {serviceCases, serviceAvailable} from './helpers/service-cases.mjs';
import {sqliteCases, sqliteAvailable} from './helpers/sqlite-cases.mjs';
import {connectionCases, connectionAvailable} from './helpers/connection-cases.mjs';
import {fileCases, fileAvailable} from './helpers/file-cases.mjs';
import {cryptoCases, cryptoAvailable} from './helpers/crypto-cases.mjs';
import {regexCases, regexAvailable} from './helpers/regex-cases.mjs';
import {executionCases, executionAvailable} from './helpers/execution-cases.mjs';
import {codecCases, codecAvailable} from './helpers/codec-cases.mjs';
import {utilityCases, utilityAvailable} from './helpers/utility-cases.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listBuiltins, getBuiltinInfo, createRuntime, moo, HostError, createWorkerSession } from '../dist/index.js';
import { createTeachingWorld } from '../dist/fixtures/index.js';
import { nodeWorkerFactory } from '../dist/worker/node-client.js';

const shared = ['add_property','add_verb','children','clear_property','create','delete_property','delete_verb','equal','function_info','index','is_clear_property','length','max_object','notify','object_bytes','parent','pass','properties','property_info','raise','recycle','rindex','set_property_info','set_verb_args','set_verb_code','set_verb_info','toliteral','tostr','typeof','valid','value_bytes','verb_args','verb_code','verb_info','verbs'];
const maps = ['mapdelete','maphaskey','mapkeys','mapvalues'];
const description = (name, min, max, types) => moo.list([moo.string(name),moo.int(min),moo.int(max),moo.list(types.map(moo.int))]);

test('static catalog requires a profile, is JSON-safe and deeply immutable without parser initialization', () => {
  for (const profile of ['lambdamoo','toaststunt']) {
    const entries = listBuiltins({ profile });
    assert.deepEqual(entries.map(e => e.name), [...shared,...(profile === 'toaststunt' ? maps : []),...Object.keys({...utilityCases,...codecCases,...executionCases,...regexCases,...cryptoCases,...fileCases,...connectionCases,...sqliteCases,...serviceCases}).filter(name=>serviceAvailable(name,profile)&&sqliteAvailable(name,profile)&&connectionAvailable(name,profile)&&fileAvailable(name,profile)&&cryptoAvailable(name,profile)&&regexAvailable(name,profile)&&executionAvailable(name,profile)&&codecAvailable(name,profile)&&utilityAvailable(name,profile))].sort());
    assert.deepEqual(JSON.parse(JSON.stringify(entries)), entries);
    const visit = value => { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(visit); } };
    visit(entries);
    assert.throws(() => entries.push({}), TypeError);
    const notify = getBuiltinInfo('NoTiFy', { profile });
    assert.equal(notify.parameters[0].name, 'recipient'); assert.deepEqual(notify.returns.types, ['int']);
    assert.throws(() => { notify.parameters[0].types[0] = 'any'; }, TypeError);
    assert.equal(getBuiltinInfo('tell', { profile }), undefined);
    assert.equal(getBuiltinInfo('constructor', { profile }), undefined);
    assert.equal(getBuiltinInfo('missing', { profile }), undefined);
    assert.deepEqual(getBuiltinInfo('raise', { profile }).returns.types, ['never']);
    for (const info of entries) {
      assert.ok(info.summary.length); assert.ok(info.returns.description.length);
      assert.equal(info.minArgs, info.parameters.filter(p => !p.optional).length);
      assert.equal(info.maxArgs, info.rest ? null : info.parameters.length);
      assert.ok(info.parameters.every(p => p.name && p.types.length && p.description));
    }
  }
  assert.throws(() => listBuiltins({}), HostError);
  assert.throws(() => listBuiltins({ profile: 'other' }), HostError);
  assert.throws(() => getBuiltinInfo(42, { profile: 'toaststunt' }), HostError);
});
for (const profile of ['lambdamoo','toaststunt']) {
  test(profile + ': function_info exposes actual supported signatures and matches runtime catalog', async () => {
    const runtime = await createRuntime({ profile });
    try {
      assert.deepEqual(runtime.listBuiltins(), listBuiltins({ profile }));
      assert.equal(runtime.getBuiltinInfo('INDEX').maxArgs, profile === 'toaststunt' ? 4 : 3);
      const examples = [
        ['notify',2,2,[1,2]], ['object_bytes',1,1,[1]], ['value_bytes',1,1,[-1]], ['tostr',0,-1,[]], ['raise',1,3,[3,2,-1]],
        ['length',1,1,[-1]], ['pass',0,-1,[]], ['verb_info',2,2,[1,-1]],
        ['function_info',0,1,[2]], ['index',2,profile === 'toaststunt' ? 4 : 3,profile === 'toaststunt' ? [2,2,-1,0] : [2,2,-1]],
        ...(profile === 'toaststunt' ? [['mapvalues',1,-1,[10]],['maphaskey',2,3,[10,-1,0]],['mapdelete',2,2,[10,-1]]] : []),
      ];
      for (const [name,min,max,types] of examples) {
        const result = runtime.run(`return function_info("${name.toUpperCase()}");`);
        assert.equal(result.status, 'completed'); assert.deepEqual(result.value, description(name,min,max,types));
      }
      const all = runtime.run('return function_info();');
      assert.equal(all.status, 'completed');
      assert.deepEqual(all.value.value.map(row => row.value[0].value), runtime.listBuiltins().map(info => info.name));
      for (const info of runtime.listBuiltins()) {
        if (info.minArgs > 0) assert.equal(runtime.run(`return ${info.name}();`).diagnostics[0].code, 'E_ARGS', info.name);
        if (info.maxArgs !== null) assert.equal(runtime.run(`return ${info.name}(${Array(info.maxArgs+1).fill('0').join(',')});`).diagnostics[0].code, 'E_ARGS', info.name);
      }
      for (const [source,code] of [
        ['return function_info(1);','E_TYPE'],['return function_info("missing");','E_INVARG'],
        ['return function_info("tell");','E_INVARG'],['return function_info("notify",1);','E_ARGS'],
      ]) assert.equal(runtime.run(source).diagnostics[0].code,code);
      if (profile === 'lambdamoo') {
        assert.equal(runtime.getBuiltinInfo('mapkeys'), undefined);
        assert.equal(runtime.run('return function_info("mapkeys");').diagnostics[0].code, 'E_INVARG');
      }
    } finally { runtime.dispose(); }
    assert.throws(() => runtime.listBuiltins(), HostError);
    assert.throws(() => runtime.getBuiltinInfo('notify'), HostError);
  });
  test(profile + ': introspection in workers is pure, bounded, and preserves prior changes on limits', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
    try {
      const session = createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() });
      const before = session.save();
      const result = await session.run('return function_info();').result;
      assert.equal(result.status,'completed'); assert.deepEqual(result.output,[]); assert.deepEqual(result.changes,[]);
      assert.equal(session.save(),before);
      for (const limits of [{ allocations: 10 }, { steps: 10 }]) {
        assert.equal(runtime.run('return function_info();',{limits}).status,'limit-exceeded');
        assert.equal((await session.run('return function_info();',{limits}).result).status,'limit-exceeded');
      }
      const limited = await session.run('this.lamp_on=1; return function_info();', { context: { this: moo.object(42) }, limits: { allocations: 30 } }).result;
      assert.equal(limited.status,'limit-exceeded'); assert.equal(limited.commit,'committed');
      assert.equal(world.getProperty(42n,'lamp_on').value,1n);
    } finally { runtime.dispose(); }
  });
}

for (const profile of ['lambdamoo','toaststunt']) test(profile + ': catalog return types agree with executed builtin results', async () => {
  const runtime = await createRuntime({profile});
  const calls = {
    ...Object.fromEntries(Object.entries({...utilityCases,...codecCases,...executionCases,...regexCases,...cryptoCases,...fileCases,...connectionCases,...sqliteCases,...serviceCases}).map(([name,[source]])=>[name,source])),
    recycled_objects:'recycled_objects()',
    ftime:'ftime()', value_hmac:'value_hmac(1,"key")',
    add_property: 'add_property(#42,"new",1,{#7,"rw"})', add_verb: 'add_verb(#42,{#7,"rx","new"},{"none","none","none"})',
    children: 'children(#1)', clear_property: 'clear_property(#42,"inherited")', create: 'create(#1,#7)',
    delete_property: 'delete_property(#42,"lamp_on")', delete_verb: 'delete_verb(#6,"tell")', equal: 'equal(1,1)',
    function_info: 'function_info()', index: 'index("abc","b")', is_clear_property: 'is_clear_property(#42,"inherited")', length: 'length({1})',
    object_bytes: 'object_bytes(#42)', value_bytes: 'value_bytes({1})', max_object: 'max_object()', notify: 'notify(#7,"hello")', parent: 'parent(#42)', pass: '#42:probe()',
    properties: 'properties(#42)', property_info: 'property_info(#42,"lamp_on")', raise: 'raise(E_TYPE)', recycle: 'recycle(#42)', rindex: 'rindex("aba","a")',
    set_property_info: 'set_property_info(#42,"lamp_on",{#7,"rw"})', set_verb_args: 'set_verb_args(#6,"tell",{"none","none","none"})',
    set_verb_code: 'set_verb_code(#6,"tell",{"return 1;"})', set_verb_info: 'set_verb_info(#6,"tell",{#7,"rx","tell"})',
    toliteral: 'toliteral({1})', tostr: 'tostr(1)', typeof: 'typeof(1)', valid: 'valid(#42)',
    verb_args: 'verb_args(#6,"tell")', verb_code: 'verb_code(#6,"tell")', verb_info: 'verb_info(#6,"tell")', verbs: 'verbs(#7)',
    mapdelete: 'mapdelete(["a"->1],"a")', maphaskey: 'maphaskey(["a"->1],"a")', mapkeys: 'mapkeys(["a"->1])', mapvalues: 'mapvalues(["a"->1])',
  };
  try {
    for (const info of runtime.listBuiltins()) {
      assert.ok(calls[info.name], 'Missing independent return-type exercise for ' + info.name);
      const world = createTeachingWorld({profile});
      fileCases[info.name]?.[3]?.(world);
      connectionCases[info.name]?.[3]?.(world);
      sqliteCases[info.name]?.[3]?.(world);
      serviceCases[info.name]?.[3]?.(world);
      world.addProperty(3n, 'inherited', moo.int(1), 7n, 'rw');
      if (info.name === 'pass') {
        world.addVerb(1n,{names:'probe',owner:7n,perms:'rx',args:['none','none','none'],source:'return 12;'});
        world.addVerb(42n,{names:'probe',owner:7n,perms:'rx',args:['none','none','none'],source:'return pass();'});
      }
      const result = await runtime[info.name === 'suspend' ? 'runAsync' : 'run']('return ' + calls[info.name] + ';',{world});
      if (info.returns.types.includes('never')) assert.equal(result.status,'runtime-error', info.name);
      else {
        assert.equal(result.status,'completed',info.name);
        assert.ok(info.returns.types.includes('any') || info.returns.types.includes(result.value.type), info.name);
      }
    }
  } finally { runtime.dispose(); }
});
