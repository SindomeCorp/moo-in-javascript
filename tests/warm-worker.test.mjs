import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorkerSession,moo} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';

for(const profile of ['toaststunt','lambdamoo'])test(`${profile}: warm workers reuse initialization, refresh source and recover after Stop`,async()=>{
 const runtime=await createRuntime({profile}),world=createTestWorld({profile});
 let starts=0;const factory=nodeWorkerFactory();
 const session=createWorkerSession({runtime,world,reuseWorker:true,workerFactory:()=>{starts++;return factory();}});
 const context={this:moo.object(42),player:moo.object(7)};
 try{
  session.warmup();session.warmup();
  assert.equal(starts,1);
  const before=runtime.saveWorld(world);
  assert.equal((await session.run('return task_id();',{context}).result).value.value,1n,'warmup must not execute a task');
  assert.equal(runtime.saveWorld(world),before);
  assert.deepEqual((await session.run('return 9;',{context}).result).changes,[]);
  assert.equal(starts,1);
  // External edits and reset/load must replace the worker's cached world.
  runtime.run('add_verb(this,{player,"rxd","value"},{"this","none","this"});set_verb_code(this,"value",{"return 1;"});',{world,context});
  assert.equal((await session.run('return this:value();',{context}).result).value.value,1n);
  runtime.run('set_verb_code(this,"value",{"return 2;"});',{world,context});
  assert.equal((await session.run('return this:value();',{context}).result).value.value,2n);
  let ready;const waiting=new Promise(resolve=>ready=resolve);
  const cancelled=session.run('this.name="must discard";notify(player,"started");while(1) endwhile',{context,limits:{steps:1000000000},onOutput:ready});
  await waiting;cancelled.stop();assert.equal((await cancelled.result).status,'cancelled');
  assert.notEqual(world.getProperty(42n,'name').value,'must discard');
  assert.equal((await session.run('return this:value();',{context}).result).value.value,2n);
  assert.equal(starts,2,'Stop must kill the worker and the next run must recreate it');
  session.reset();assert.equal(runtime.saveWorld(world),before);
  assert.equal((await session.run('return this:value();',{context}).result).status,'runtime-error');
  const timed=session.run('this.name="timeout";while(1) endwhile',{context,limits:{steps:1000000000},timeoutMs:30});
  assert.equal((await timed.result).reason,'timeout');assert.notEqual(world.getProperty(42n,'name').value,'timeout');
  const restarted=await session.run('return this.name;',{context}).result;assert.equal(restarted.status,'completed');
  session.dispose();assert.throws(()=>session.run('return 1;'),/disposed/);
 }finally{session.dispose();runtime.dispose();}
});
