import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { createRuntime, createWorld, createSession, moo, saveWorld, loadWorld, worldSnapshot, HostError } from '../dist/index.js';
import { createTeachingWorld } from '../dist/fixtures/index.js';

const context = { this: moo.object(42), player: moo.object(7), caller: moo.object(7), verb: 'snapshot-test', args: [moo.int(8)] };
const complete = result => { assert.equal(result.status, 'completed', inspect(result.diagnostics)); return result.value; };

for (const profile of ['lambdamoo', 'toaststunt']) {
  test(profile + ': lossless snapshot round trip after lifecycle, metadata and source changes', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
    try {
      complete(runtime.run('p=create(#1); c=create(p); add_property(p,"data",{1,#999,E_TYPE},{player,"rwc"}); c.data={2}; add_verb(c,{player,"rx","get"},{"none","none","none"}); set_verb_code(c,"get",{"return {this.data, args};"}); spare=create(#-1); recycle(spare);', { world, context }));
      const nested = moo.list([moo.int(profile === 'toaststunt' ? 9223372036854775807n : 2147483647n), moo.float(-0), moo.float(1.25), moo.object(-1), moo.error('E_DIV'),
        profile === 'toaststunt' ? moo.map([[moo.string('key'), moo.list([moo.int(3)])]]) : moo.list([moo.string('value')])]);
      world.setProperty(43n, 'data', nested);
      const json = runtime.saveWorld(world);
      const raw = JSON.parse(json);
      assert.deepEqual(Object.keys(raw).sort(), ['nextId', 'objects', 'profile', 'version']);
      assert.equal(raw.nextId, '46'); assert.equal(raw.profile, profile); assert.equal(raw.version, 1);
      assert.ok(!json.includes('snapshot-test'));
      const restored = runtime.loadWorld(json);
      assert.equal(restored.profile, profile); assert.equal(restored.nextId, world.nextId);
      assert.deepEqual(restored.objects(), world.objects());
      assert.deepEqual(restored.getProperty(43n, 'data'), nested);
      assert.deepEqual(complete(runtime.run('return #44:get(7);', { world: restored, context })), moo.list([moo.list([moo.int(2)]), moo.list([moo.int(7)])]));
      const loadedWithoutRuntime = await loadWorld(json);
      assert.equal(loadedWithoutRuntime.profile, profile);
      assert.equal(saveWorld(loadedWithoutRuntime), json);
      assert.deepEqual(complete(runtime.run('return create(#-1);', { world: restored, context })), moo.object(46));
    } finally { runtime.dispose(); }
  });
  test(profile + ': retained session reset, load and fresh attempts have explicit state', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
    try {
      const session = createSession({ runtime, world });
      complete(session.run('this.lamp_on=1;', { context }));
      assert.equal(world.getProperty(42n, 'lamp_on').value, 1n);
      const saved = session.save();
      const fresh = session.runFresh('this.lamp_on=2;', { context });
      complete(fresh.result); assert.equal(fresh.world.getProperty(42n, 'lamp_on').value, 2n);
      assert.equal(world.getProperty(42n, 'lamp_on').value, 1n);
      session.reset(); assert.equal(world.getProperty(42n, 'lamp_on').value, 0n);
      session.load(saved); assert.equal(world.getProperty(42n, 'lamp_on').value, 1n);
      assert.throws(() => session.load('{"version":9}'), HostError);
      assert.equal(session.save(), saved);
      for (const operation of [() => session.save(), () => session.reset(), () => session.load(saved)]) {
        assert.throws(() => session.run('notify(player,"during");', { context, onOutput: operation }), HostError);
      }
      session.reset(); assert.equal(world.getProperty(42n, 'lamp_on').value, 0n);
    } finally { runtime.dispose(); }
  });
}

test('all source is compiled on load, without executing it, before replacing target', async () => {
  const runtime = await createRuntime({ profile: 'toaststunt' }), world = createTeachingWorld({ profile: 'toaststunt' });
  world.addVerb(42n, { names: 'never-called', owner: 7n, perms: 'rx', args: ['none', 'none', 'none'], source: 'this.lamp_on=99; return 7;' });
  try {
    const snapshot = worldSnapshot(world), original = runtime.compile.bind(runtime), compiled = [];
    runtime.compile = source => { compiled.push(source); return original(source); };
    const loaded = runtime.loadWorld(snapshot);
    assert.deepEqual(compiled.sort(), ['return notify(this, tostr(@args));', 'this.lamp_on=99; return 7;'].sort());
    assert.equal(loaded.getProperty(42n, 'lamp_on').value, 0n);
    const before = saveWorld(world);
    for (const source of ['return (;', 'return 7; fork(0) return 8; endfork']) {
      const bad = structuredClone(snapshot); bad.objects.find(o => o.id === '42').verbs[0].source = source;
      assert.throws(() => runtime.loadWorld(bad, { world }), HostError);
      assert.equal(saveWorld(world), before);
    }
  } finally { runtime.dispose(); }
});

test('malformed schemas, IDs, values, cycles and inheritance slots are rejected atomically', async () => {
  const runtime = await createRuntime({ profile: 'toaststunt' }), world = createTeachingWorld({ profile: 'toaststunt' });
  const before = saveWorld(world), snapshot = worldSnapshot(world);
  const mutations = [
    s => { delete s.profile; }, s => { s.version = 2; }, s => { s.history = []; },
    s => { s.nextId = '01'; }, s => { s.nextId = '42'; }, s => { s.objects[0].id = '-1'; },
    s => { s.objects.push(structuredClone(s.objects[0])); },
    s => { s.objects[0].parent = '999'; }, s => { s.objects[0].parent = '42'; },
    s => { s.objects[0].flags.wizard = 2; },
    s => { s.objects[0].properties[0].value = null; },
    s => { s.objects.find(o => o.id === '7').properties = []; },
    s => { s.objects.find(o => o.id === '7').properties[0].origin = '42'; },
    s => { s.objects[0].properties.push(structuredClone(s.objects[0].properties[0])); },
    s => { s.objects[0].properties[0].value = { type: 'int', value: '99999999999999999999999999' }; },
    s => { s.objects[0].properties[0].value = { type: 'float', value: 'NaN' }; },
    s => { s.objects[0].properties[0].value = { type: 'map', value: [[{ type: 'string', value: 'a' }, { type: 'int', value: '1' }], [{ type: 'string', value: 'A' }, { type: 'int', value: '2' }]] }; },
    s => { s.objects.find(o => o.id === '7').verbs[0].hostId = 'cannot.also.have.source'; },
    s => { s.objects.find(o => o.id === '7').verbs[0].args = ['bad', 'none', 'any']; },
  ];
  try {
    for (const mutate of mutations) {
      const malformed = structuredClone(snapshot); mutate(malformed);
      assert.throws(() => runtime.loadWorld(malformed, { world }), HostError);
      assert.equal(saveWorld(world), before);
    }
    let invoked = false;
    const accessor = { ...snapshot };
    Object.defineProperty(accessor, 'objects', { enumerable: true, get() { invoked = true; return []; } });
    assert.throws(() => runtime.loadWorld(accessor), HostError); assert.equal(invoked, false);
    const cyclic = { ...snapshot }; cyclic.objects = [cyclic];
    assert.throws(() => runtime.loadWorld(cyclic), HostError);
    assert.throws(() => runtime.loadWorld(Object.assign(Object.create({}), snapshot)), HostError);
  } finally { runtime.dispose(); }
});

test('snapshot size and profile gates leave existing worlds unchanged', async () => {
  const runtime = await createRuntime({ profile: 'toaststunt' }), world = createTeachingWorld({ profile: 'toaststunt' });
  const original = saveWorld(world);
  try {
    for (const limits of [{ maxCharacters: 20 }, { maxNodes: 3 }, { maxDepth: 2 }]) {
      assert.throws(() => runtime.loadWorld(original, { world, limits }), HostError);
      assert.equal(saveWorld(world), original);
    }
    assert.throws(() => saveWorld(world, { maxCharacters: original.length - 1 }), HostError);
    assert.throws(() => runtime.loadWorld(original, { worldLimits: { objects: 3 } }), HostError);
    const lambda = createTeachingWorld({ profile: 'lambdamoo' });
    assert.throws(() => runtime.loadWorld(saveWorld(lambda), { world }), HostError);
    await assert.rejects(loadWorld(original, { world: lambda }), HostError);
    assert.equal(world.getProperty(42n, 'lamp_on').value, 0n);
  } finally { runtime.dispose(); }
});

test('dangling values and metadata after owner recycling survive snapshots', async () => {
  const runtime = await createRuntime({ profile: 'lambdamoo' }), world = createTeachingWorld({ profile: 'lambdamoo' });
  world.recycle(7n);
  try {
    const restored = runtime.loadWorld(saveWorld(world));
    assert.equal(restored.get(42n).owner, 7n); assert.equal(restored.valid(7n), false);
    assert.deepEqual(restored.objects(), world.objects());
  } finally { runtime.dispose(); }
});

test('host verb IDs round-trip, registrations are checked, and host bugs are not MOO errors', async () => {
  const profile = 'toaststunt', world = createTeachingWorld({ profile });
  const called = [];
  const hostVerbs = {
    'test.echo': host => { called.push(host.frame.this); host.chargeSteps(2); host.notify(moo.object(host.frame.player), 'from host'); return host.args[0]; },
    'test.error': host => host.raise('E_INVARG', 'expected', moo.int(9)),
    'test.bug': () => { throw Error('host bug'); },
    'test.invalid': () => ({ type: 'int', value: 1n }),
    'test.limit': host => { host.chargeSteps(1_000_000); return moo.int(0); },
    'test.badraise': host => host.raise('E_TYPE', 45),
    'test.negative': host => { host.chargeSteps(-1); return moo.int(0); },
  };
  for (const id of Object.keys(hostVerbs)) world.addVerb(42n, { names: id.split('.')[1], owner: 7n, perms: 'rx', args: ['none', 'none', 'none'], source: '', hostId: id });
  const runtime = await createRuntime({ profile, hostVerbs }), withoutHosts = await createRuntime({ profile });
  try {
    const json = saveWorld(world);
    assert.ok(json.includes('"hostId":"test.echo"')); assert.ok(!json.includes('host.chargeSteps'));
    assert.throws(() => withoutHosts.loadWorld(json), /registration is unavailable/);
    const restored = runtime.loadWorld(json);
    assert.deepEqual(called, []);
    const result = runtime.run('return this:echo(7);', { world: restored, context });
    assert.deepEqual(complete(result), moo.int(7)); assert.equal(result.output[0].text, 'from host'); assert.deepEqual(called, [42n]);
    assert.deepEqual(complete(runtime.run('try this:error(); except e (E_INVARG) return e[3]; endtry', { world: restored, context })), moo.int(9));
    for (const name of ['bug', 'invalid', 'badraise', 'negative']) assert.throws(() => runtime.run('try this:' + name + '(); except (ANY) return 7; endtry', { world: restored, context }), HostError);
    assert.equal(runtime.run('try this:limit(); except (ANY) return 7; endtry', { world: restored, context }).status, 'limit-exceeded');
    complete(runtime.run('set_verb_code(this,"echo",{"return 4;"});', { world: restored, context }));
    assert.deepEqual(complete(runtime.run('return this:echo();', { world: restored, context })), moo.int(4));
    assert.equal(restored.ownVerb(42n, 'echo').verb.hostId, undefined);
    const standalone = await loadWorld(json, { hostVerbs });
    assert.equal(standalone.ownVerb(42n, 'echo').verb.hostId, 'test.echo');
  } finally { runtime.dispose(); withoutHosts.dispose(); }
});
