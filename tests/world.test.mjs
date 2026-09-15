import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { createRuntime, createWorld, moo, HostError } from '../dist/index.js';
import { createTeachingWorld } from '../dist/fixtures/index.js';

const context = { this: moo.object(42), player: moo.object(7), caller: moo.object(7), verb: 'test' };
function completed(result) {
  assert.equal(result.status, 'completed', inspect(result.diagnostics, { depth: 8 }));
  return result.value;
}

for (const profile of ['lambdamoo', 'toaststunt']) {
  test(profile + ': retained properties, computed names and MOO fixture output', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile }), events = [];
    try {
      const result = runtime.run('this.("lamp_on")=1; player:("tell")("lamp=",this.lamp_on); return $room;', { world, context, runId: 'lesson', onOutput: event => events.push(event) });
      assert.deepEqual(completed(result), moo.object(1));
      assert.equal(world.getProperty(42n, 'lamp_on').value, 1n);
      assert.deepEqual(result.output, events);
      assert.deepEqual(events.map(e => [e.runId, e.sequence, e.recipient.value, e.text]), [['lesson', 0, 7n, 'lamp=1']]);
      assert.ok(result.changes.some(change => change.kind === 'object-updated' && change.object === 42n));
      assert.deepEqual(completed(runtime.run('return this.lamp_on;', { world, context })), moo.int(1));
      assert.equal(runtime.run('this.missing=1;', { world, context }).diagnostics[0].code, 'E_PROPNF');
      assert.equal(runtime.run('return #999.name;', { world, context }).diagnostics[0].code, 'E_INVIND');
    } finally { runtime.dispose(); }
  });
  test(profile + ': creation, inherited clear slots and recycling relationships', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
    try {
      const result = runtime.run('p=create(#-1); add_property(p,"counter",1,{player,"rwc"}); c=create(p); d=create(c); c.counter=2; before={c.counter,d.counter,is_clear_property(d,"counter"),parent(d)}; clear_property(c,"counter"); after=d.counter; recycle(c); return {p,d,before,after,parent(d),valid(c),properties(d)};', { world, context });
      assert.deepEqual(completed(result).value, [moo.object(43), moo.object(45), moo.list([moo.int(2), moo.int(2), moo.int(1), moo.object(44)]), moo.int(1), moo.object(43), moo.int(0), moo.list([])]);
      assert.deepEqual(world.children(43n).map(o => o.id), [45n]);
      assert.equal(world.nextId, 46n);
      assert.deepEqual(completed(runtime.run('return create(#-1);', { world, context })), moo.object(46));
    } finally { runtime.dispose(); }
  });
  test(profile + ': inherited calls and pass retain receiver with independent locals', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
    world.addVerb(1n, { names: 'calc', owner: 7n, perms: '', args: ['this', 'none', 'this'], source: 'local=100; return {this,caller,player,verb,args[1]+1};' });
    world.addVerb(42n, { names: 'calc', owner: 7n, perms: 'rx', args: ['this', 'none', 'this'], source: 'local=9; result=pass(@args); return {result,local};' });
    try {
      assert.deepEqual(completed(runtime.run('local=2; result=this:calc(6); return {result,local};', { world, context })),
        moo.list([moo.list([moo.list([moo.object(42), moo.object(42), moo.object(7), moo.string('calc'), moo.int(7)]), moo.int(9)]), moo.int(2)]));
      const result = runtime.run('add_verb(this,{player,"rx","answer"},{"this","none","this"}); errors=set_verb_code(this,"answer",{"return 7;"}); bad=set_verb_code(this,"answer",{"return (;"}); return {errors,length(bad)>0,this:answer()};', { world, context });
      assert.deepEqual(completed(result), moo.list([moo.list([]), moo.int(1), moo.int(7)]));
      assert.equal(runtime.run('return this:no_such_verb();', { world, context }).diagnostics[0].code, 'E_VERBNF');
      assert.equal(runtime.run('return no_such_function();', { world, context }).diagnostics[0].code, 'E_INVARG');
    } finally { runtime.dispose(); }
  });
  test(profile + ': errors and controlled limits retain writes and delivered output', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
    try {
      const error = runtime.run('this.lamp_on=1; player:tell("before"); return 1/0;', { world, context });
      assert.equal(error.status, 'runtime-error'); assert.equal(error.commit, 'committed');
      assert.equal(world.getProperty(42n, 'lamp_on').value, 1n); assert.equal(error.output[0].text, 'before');
      const limit = runtime.run('this.lamp_on=2; while(1) endwhile', { world, context, limits: { steps: 200 } });
      assert.equal(limit.status, 'limit-exceeded'); assert.equal(world.getProperty(42n, 'lamp_on').value, 2n);
      const outputLimit = runtime.run('this.lamp_on=3; notify(player,"abc"); notify(player,"def");', { world, context, limits: { outputCharacters: 4 } });
      assert.equal(outputLimit.status, 'limit-exceeded');
      assert.deepEqual(outputLimit.output.map(e => e.text), ['abc']); assert.equal(world.getProperty(42n, 'lamp_on').value, 3n);
    } finally { runtime.dispose(); }
  });
}

test('metadata edits/deletions propagate definitions and preserve inherited overrides', async () => {
  const profile = 'toaststunt', runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
  try {
    const result = runtime.run('p=create(#-1); add_property(p,"score",1,{player,"rw"}); c=create(p); c.score=5; set_property_info(p,"score",{player,"rwc","total"}); value={c.total,property_info(p,"total"),properties(p)}; delete_property(p,"total"); return {value,properties(p)};', { world, context });
    assert.deepEqual(completed(result), moo.list([moo.list([moo.int(5), moo.list([moo.object(7), moo.string('rwc')]), moo.list([moo.string('total')])]), moo.list([])]));
    const verb = runtime.run('add_verb(this,{player,"rwx","a*nswer"},{"this","none","any"}); set_verb_code(this,1,{"return 9;"}); set_verb_info(this,1,{player,"rx","renamed"}); x=this:renamed(); delete_verb(this,1); return {x,verbs(this)};', { world, context });
    assert.deepEqual(completed(verb), moo.list([moo.int(9), moo.list([])]));
  } finally { runtime.dispose(); }
});

test('call limits bypass catches and nested errors include receiver/source frames', async () => {
  const profile = 'toaststunt', runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
  world.addVerb(42n, { names: 'recurse', owner: 7n, perms: 'rx', args: ['none', 'none', 'none'], source: 'try return this:recurse(); except (ANY) return 7; endtry' });
  world.addVerb(42n, { names: 'bad', owner: 7n, perms: 'rx', args: ['none', 'none', 'none'], source: 'return 1/0;' });
  world.addVerb(42n, { names: 'localcatch', owner: 7n, perms: 'rx', args: ['none', 'none', 'none'], source: 'try 1/0; except e (ANY) return length(e[4]); endtry' });
  try {
    const limited = runtime.run('return this:recurse();', { world, context, limits: { callDepth: 4 } });
    assert.equal(limited.status, 'limit-exceeded'); assert.equal(limited.statistics.peakCallDepth, 4);
    const error = runtime.run('return this:bad();', { world, context });
    assert.equal(error.diagnostics[0].stack[0].verb, 'bad'); assert.equal(error.diagnostics[0].stack[0].this, 42n);
    const caught = runtime.run('try this:bad(); except e (E_DIV) return {e[1],e[4][1][2],e[4][1][6]}; endtry', { world, context });
    assert.deepEqual(completed(caught), moo.list([moo.error('E_DIV'), moo.string('bad'), moo.int(1)]));
    assert.deepEqual(completed(runtime.run('return this:localcatch();', { world, context })), moo.int(1));
    assert.throws(() => runtime.run('notify(player,"x");', { world, context, onOutput() { throw Error('delivery broke'); } }), HostError);
    assert.throws(() => runtime.run('notify(player,"x");', { world, context, onOutput() { runtime.run('return 1;', { world }); } }), HostError);
    assert.deepEqual(completed(runtime.run('return 1;', { world })), moo.int(1));
    assert.throws(() => runtime.run('return 1;', { world: createWorld({ profile: 'lambdamoo' }) }), HostError);
  } finally { runtime.dispose(); }
});

test('world quotas reject whole mutations without reusing IDs', async () => {
  const profile = 'toaststunt', runtime = await createRuntime({ profile }), world = createWorld({ profile, limits: { objects: 2, properties: 1 } });
  world.addObject({ id: 0 });
  try {
    const result = runtime.run('o=create(#-1,#0); create(#-1,#0);', { world, context: { player: moo.object(0) } });
    assert.equal(result.status, 'limit-exceeded'); assert.equal(world.nextId, 2n);
    assert.deepEqual(world.objects().map(o => o.id), [0n, 1n]);
    const property = runtime.run('add_property(#0,"x",1,{#0,"r"}); add_property(#0,"y",2,{#0,"r"});', { world });
    assert.equal(property.status, 'limit-exceeded'); assert.equal(world.getProperty(0n, 'x').value, 1n);
    assert.throws(() => world.getProperty(0n, 'y'));
  } finally { runtime.dispose(); }
});

test('verb abbreviations, canonical prepositions and exhausted lifecycle deltas are explicit', async () => {
  const profile = 'toaststunt', runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
  try {
    const result = runtime.run('add_verb(this,{player,"rx","a*nswer alias"},{"this","from","any"}); set_verb_code(this,1,{"return 9;"}); return {this:a(),this:ans(),this:alias(),verb_args(this,1)};', { world, context });
    assert.deepEqual(completed(result), moo.list([moo.int(9), moo.int(9), moo.int(9), moo.list([moo.string('this'), moo.string('out of/from inside/from'), moo.string('any')])]));
    const lifetime = runtime.run('o=create(#-1); recycle(o);', { world, context });
    assert.deepEqual(lifetime.changes, [{ kind: 'allocation-state', before: 43n, after: 44n }]);
    world.addVerb(1n, { names: 'initialize', owner: 7n, perms: 'rx', args: ['none', 'none', 'none'], source: 'return;' });
    const blockedHook = runtime.run('create(#1);', { world, context });
    assert.equal(blockedHook.status, 'runtime-error');
    assert.match(blockedHook.diagnostics[0].message, /initialize lifecycle hooks/);
    assert.equal(world.nextId, 44n);
  } finally { runtime.dispose(); }
});
