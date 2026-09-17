import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorkerSession,moo,HostError} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';
const I=moo.int,O=moo.object,S=moo.string,L=(...v)=>moo.list(v);
const context={this:O(42),player:O(7),caller:O(7)};
const verb=(names,source)=>({names,source,owner:7n,perms:'rx',args:['none','none','none']});
for(const profile of ['lambdamoo','toaststunt'])test(`${profile}: movement, inheritance and player flags persist atomically`,async t=>{
 const r=await createRuntime({profile});
 try{
  const world=createTestWorld({profile});world.addObject({id:43,parent:1,owner:7});world.addObject({id:44,parent:42,owner:7});
  world.addProperty(1n,'base_only',I(2),7n,'r');world.setProperty(44n,'root_value',I(99));world.addProperty(7n,'new_prop',I(5),7n,'rc');
  assert.equal(r.run('chparent(#42,#7);',{world,context}).status,'completed');
  assert.deepEqual(world.getProperty(44n,'root_value'),I(99));assert.deepEqual(world.getProperty(44n,'new_prop'),I(5));assert.equal(world.property(44n,'new_prop').owner,7n);
  assert.throws(()=>world.getProperty(44n,'base_only'),e=>e.code==='E_PROPNF');
  const before=r.saveWorld(world);assert.equal(r.run('chparent(#7,#44);',{world,context}).diagnostics[0].code,'E_RECMOVE');assert.equal(r.saveWorld(world),before);
  world.addProperty(43n,'new_prop',I(9),7n,'r');const conflict=r.saveWorld(world);assert.equal(r.run('chparent(#7,#43);',{world,context}).diagnostics[0].code,'E_INVARG');assert.equal(r.saveWorld(world),conflict);
  const depth=createTestWorld({profile,limits:{inheritanceDepth:3}});assert.equal(r.run('chparent(#1,#7);',{world:depth,context}).status,'limit-exceeded');assert.equal(depth.get(1n).parent,0n);
  world.addVerb(7n,verb('accept','return 1;'));world.addVerb(7n,verb('enterfunc','this.root_value = args[1];'));world.addVerb(7n,verb('exitfunc','this.root_value = 0;'));
  let result=r.run('set_player_flag(#7,1); move(#42,#7); return {players(),is_player(#7),#42.location,#7.contents};',{world,context});
  assert.deepEqual(result.value,L(L(O(7)),I(1),O(7),L(O(42))));assert.deepEqual(world.getProperty(7n,'root_value'),O(42));
  world.addVerb(42n,verb('accept','return 1;'));
  assert.equal(r.run('move(#7,#42);',{world,context}).diagnostics[0].code,'E_RECMOVE');
  assert.equal(r.run('move(#43,#0);',{world,context}).diagnostics[0].code,'E_NACC');
  assert.equal(r.run('move(#43,#999);',{world,context}).diagnostics[0].code,'E_INVARG');
  assert.equal(r.run('move(#43,#7);',{world,context}).status,'completed');assert.deepEqual(world.getProperty(7n,'contents'),L(O(42),O(43)));
  if(profile==='toaststunt'){
   assert.equal(r.run('move(#43,#7,1);',{world,context}).status,'completed');assert.deepEqual(world.getProperty(7n,'contents'),L(O(43),O(42)));
   assert.equal(r.run('move(#43,#7,-1);',{world,context}).diagnostics[0].code,'E_INVARG');assert.equal(r.run('move(#43,#7,"x");',{world,context}).diagnostics[0].code,'E_TYPE');
  }
  const saved=r.saveWorld(world),loaded=r.loadWorld(saved);assert.equal(r.saveWorld(loaded),saved);
  for(const mutate of [s=>s.objects.find(o=>o.id==='7').contents.push('42'),s=>s.objects.find(o=>o.id==='42').location='999',s=>s.objects.find(o=>o.id==='7').player=1,s=>s.objects.find(o=>o.id==='7').contents.push('999'),s=>{s.objects.find(o=>o.id==='7').location='42';s.objects.find(o=>o.id==='42').contents=['7'];}]){
   const malformed=JSON.parse(saved);mutate(malformed);assert.throws(()=>r.loadWorld(malformed),HostError);
  }
  const session=createWorkerSession({runtime:r,world,workerFactory:nodeWorkerFactory()});result=await session.run('move(#42,#-1); set_player_flag(#7,0); return {#42.location,#7.contents,players()};',{context}).result;
  assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));assert.deepEqual(world.getProperty(42n,'location'),O(-1));assert.equal(world.get(7n).player,false);
  assert.deepEqual(world.getProperty(7n,'root_value'),I(0));
  world.relocate(42n,7n);world.recycle(7n);assert.deepEqual(world.getProperty(42n,'location'),O(-1));assert.deepEqual(world.getProperty(43n,'location'),O(-1));r.loadWorld(r.saveWorld(world));
  assert.deepEqual(r.run('return task_id();',{runId:'custom ID'}).value.type,'int');
  const permissions=createTestWorld({profile});assert.equal(r.run('set_task_perms(#1);',{world:permissions,context}).diagnostics[0].code,'E_PERM');permissions.setProperty(7n,'wizard',I(1));assert.deepEqual(r.run('set_task_perms(#1); return task_perms();',{world:permissions,context}).value,O(1));
 }finally{r.dispose();}
});
