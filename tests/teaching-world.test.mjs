import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime, moo} from '../dist/index.js';
import {createTeachingWorld} from '../dist/fixtures/index.js';
for (const profile of ['lambdamoo', 'toaststunt']) test(`${profile}: teaching classes do not inherit system properties`, async () => {
  const runtime = await createRuntime({profile});
  try {
    const world = createTeachingWorld({profile});
    assert.deepEqual(world.objects().map(o => [o.id,o.parent]), [[0n,1n],[1n,-1n],[3n,1n],[5n,1n],[6n,1n],[7n,6n],[42n,3n]]);
    const result = runtime.run('room = create($room); thing = create($thing); person = create($player); return {parent(room), parent(thing), parent(person), children(#1)};', {world});
    assert.equal(result.status,'completed');
    assert.deepEqual(result.value, moo.list([moo.object(3),moo.object(5),moo.object(6),moo.list([moo.object(0),moo.object(3),moo.object(5),moo.object(6)])]));
    world.addProperty(0n,'system_only',moo.int(123),7n,'r');
    for (const id of [1n,3n,5n,6n,7n,42n,43n,44n,45n]) {
      assert.equal(world.get(id).properties.some(p => ['room','thing','player','system_only'].includes(p.name)),false,`#${id} must not inherit system aliases`);
    }
    assert.deepEqual(world.get(7n).verbs, []);
    assert.equal(world.get(6n).verbs[0].names, 'tell notify');
    const greeting = runtime.run('player:tell("Inherited greeting"); #45:tell("New player greeting");', {world,context:{player:moo.object(7)}});
    assert.equal(greeting.status,'completed');
    assert.deepEqual(greeting.output.map(e => [e.recipient.value,e.text]), [[7n,'Inherited greeting'],[45n,'New player greeting']]);
    const saved = runtime.loadWorld(runtime.saveWorld(world));
    assert.deepEqual(saved.objects(),world.objects());
  } finally {runtime.dispose();}
});
