import { createWorld, type World } from '../world/index.js';
import { moo } from '../values/index.js';
import type { Profile } from '../parser/index.js';

/** Optional teaching data; the evaluator has no knowledge of these IDs. */
export function createTeachingWorld(options: { profile: Profile }): World {
  const world = createWorld(options);
  world.addObject({ id: 0, owner: 0, name: 'System' });
  world.addObject({ id: 1, parent: 0, owner: 0, name: 'Generic Room' });
  world.addObject({ id: 7, parent: 0, owner: 7, name: 'Learner' });
  world.addObject({ id: 42, parent: 1, owner: 7, name: 'Training Room' });
  world.setProperty(0n, 'owner', moo.object(7)); world.setProperty(1n, 'owner', moo.object(7));
  world.addProperty(0n, 'room', moo.object(1), 7n, 'r');
  world.addProperty(42n, 'lamp_on', moo.int(0), 7n, 'rw');
  world.addProperty(42n, 'locked', moo.int(1), 7n, 'rw');
  world.addVerb(7n, { names: 'tell notify', owner: 7n, perms: 'rx', args: ['this', 'none', 'this'],
    source: 'return notify(this, tostr(@args));' });
  return world;
}
