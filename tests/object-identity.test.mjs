import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,moo} from '../dist/index.js';
import {createTestWorld} from './helpers/world.mjs';
for(const profile of ['lambdamoo','toaststunt'])test(`${profile}: renumber repairs graph and metadata while ordinary references remain numeric`,async()=>{
 const runtime=await createRuntime({profile}),world=createTestWorld({profile});
 try{
  world.addObject({id:43,parent:42,owner:42});world.relocate(43n,42n,0);world.setPlayer(42n,true);world.addProperty(42n,'reference',moo.object(42),42n,'r');
  world.addVerb(42n,{names:'example',owner:42n,perms:'r',args:['none','none','none'],source:'return #42;'});
  const result=runtime.run('return renumber(#42);',{world});assert.equal(result.status,'completed');assert.deepEqual(result.value,moo.object(2));
  assert.equal(world.get(43n).parent,2n);assert.equal(world.get(43n).owner,2n);assert.equal(world.get(43n).location,2n);assert.deepEqual(world.get(2n).contents,[43n]);assert.equal(world.get(2n).player,true);
  assert.equal(world.property(43n,'reference').origin,2n);assert.equal(world.property(43n,'reference').owner,2n);assert.deepEqual(world.getProperty(43n,'reference'),moo.object(42));assert.equal(world.ownVerb(2n,'example').verb.owner,2n);
  const saved=runtime.saveWorld(world);assert.equal(runtime.saveWorld(runtime.loadWorld(saved)),saved);
  world.recycle(43n);assert.equal(runtime.run('reset_max_object();',{world}).status,'completed');assert.deepEqual(runtime.run('return create(#1);',{world}).value,moo.object(8));
 }finally{runtime.dispose();}
});
test('recreate initializes reused identities and rejects live or unallocated IDs',async()=>{
 const runtime=await createRuntime({profile:'toaststunt'}),world=createTestWorld({profile:'toaststunt'});
 try{
  world.addVerb(1n,{names:'initialize',owner:7n,perms:'rx',args:['none','none','none'],source:'this.name="initialized";'});
  assert.deepEqual(runtime.run('return recreate(#2,#1);',{world}).value,moo.object(2));assert.equal(world.get(2n).name,'initialized');
  for(const id of [0,2,999]){const before=runtime.saveWorld(world);assert.equal(runtime.run(`recreate(#${id},#1);`,{world}).status,'runtime-error');assert.equal(runtime.saveWorld(world),before);}
 }finally{runtime.dispose();}
});
