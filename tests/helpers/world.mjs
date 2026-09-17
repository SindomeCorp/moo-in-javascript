import {createWorld, moo} from '../../dist/index.js';

// Stable test-owned world, independent of the optional classroom fixture.
export function createTestWorld({profile, limits} = {}) {
  const world = createWorld({profile, limits});
  world.addObject({id:0, name:'Root'});
  world.addObject({id:1, parent:0, owner:0, name:'Base'});
  world.addObject({id:7, parent:0, owner:7, name:'Actor'});
  world.addObject({id:42, parent:1, owner:7, name:'Receiver'});
  world.addProperty(0n,'root_value',moo.int(1),7n,'r');
  world.addProperty(42n,'lamp_on',moo.int(0),7n,'rw');
  world.addVerb(7n,{names:'tell',owner:7n,perms:'rx',args:['this','none','this'],source:'return notify(this, args[1]);'});
  return world;
}
