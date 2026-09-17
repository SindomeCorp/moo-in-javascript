import { createWorld, type World } from '../world/index.js';
import { moo } from '../values/index.js';
import type { Profile } from '../parser/index.js';

/** Optional teaching data; the evaluator has no knowledge of these IDs. */
export function createTeachingWorld(options: { profile: Profile }): World {
  const world = createWorld(options);
  world.addObject({ id: 0, owner: 0, name: 'The System Object' });
  world.addObject({ id: 1, owner: 0, name: 'Root Class' });
  world.addObject({ id: 3, parent: 1, owner: 1, name: 'Generic Room' });
  world.addObject({ id: 5, parent: 1, owner: 1, name: 'Generic Thing' });
  world.addObject({ id: 6, parent: 1, owner: 1, name: 'Generic Player' });
  world.addObject({ id: 7, parent: 6, owner: 7, name: 'Learner' });
  world.addObject({ id: 42, parent: 3, owner: 7, name: 'Training Room' });
  for (const id of [1n, 0n, 3n, 5n, 6n]) world.setProperty(id, 'owner', moo.object(7));
  // Allocate IDs in order, then attach the System Object to its root class.
  world.restore(world.objects().map(object => object.id === 0n ? {...object, parent: 1n} : object), world.nextId);
  // System aliases are available through $name without becoming properties
  // inherited by every room, thing, and player.
  world.addProperty(0n, 'room', moo.object(3), 7n, 'r');
  world.addProperty(0n, 'thing', moo.object(5), 7n, 'r');
  world.addProperty(0n, 'player', moo.object(6), 7n, 'r');
  world.addProperty(42n, 'lamp_on', moo.int(0), 7n, 'rw');
  world.addProperty(42n, 'locked', moo.int(1), 7n, 'rw');
  world.addVerb(6n, { names: 'tell notify', owner: 7n, perms: 'rx', args: ['this', 'none', 'this'],
    source: 'return notify(this, tostr(@args));' });
  return world;
}
