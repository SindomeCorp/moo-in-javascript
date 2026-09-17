import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorkerSession,moo} from '../dist/index.js';
import {createTeachingWorld} from '../dist/fixtures/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
const context={this:moo.object(42),player:moo.object(7)};
for(const profile of ['lambdamoo','toaststunt'])test(`${profile}: suspend continues nested calls and replenishes only the time and tick slice`,async()=>{
 const runtime=await createRuntime({profile}),world=createTeachingWorld({profile});
 try{
  world.addVerb(42n,{names:'pause',owner:7n,perms:'rx',args:['this','none','this'],source:'suspend(0); return 7;'});
  const result=await runtime.runAsync('before=ticks_left(); for i in [1..4] x=i+1; endfor remaining=ticks_left(); value=this:pause(); return {value,ticks_left()>remaining};',{world,context,limits:{steps:200}});
  assert.equal(result.status,'completed');assert.deepEqual(result.value,moo.list([moo.int(7),moo.int(1)]));
  assert.deepEqual((await runtime.runAsync('return eval("return call_function(\\"suspend\\",0);");',{world})).value,moo.list([moo.int(1),moo.int(0)]));
  assert.equal((await runtime.runAsync('while(1) suspend(0); endwhile',{limits:{steps:30}})).status,'limit-exceeded');
  const bounded=await runtime.runAsync('while(1) x={1,2,3}; suspend(0); endwhile',{limits:{steps:50,allocations:15}});
  assert.equal(bounded.status,'limit-exceeded');assert.match(bounded.diagnostics[0].message,/allocations/);
  for(const [source,code] of [['suspend(-1);','E_INVARG'],['suspend("1");','E_TYPE'],['suspend();','E_ARGS']])assert.equal((await runtime.runAsync(source)).diagnostics[0].code,code);
  assert.equal(runtime.run('suspend(0);').diagnostics[0].code,'E_INVARG');
  assert.deepEqual((await runtime.runAsync('try suspend(0); return 2; finally x=1; endtry')).value,moo.int(2));
 }finally{runtime.dispose();}
});
test('suspend yields to the event loop and worker Stop discards pending writes',async()=>{
 const runtime=await createRuntime({profile:'toaststunt'}),world=createTeachingWorld({profile:'toaststunt'});
 try{
  let ticked=false;setTimeout(()=>{ticked=true;},5);
  assert.equal((await runtime.runAsync('return suspend(0.03);')).status,'completed');assert.equal(ticked,true);
  const session=createWorkerSession({runtime,world,workerFactory:nodeWorkerFactory()});
  let signal;const started=new Promise(resolve=>{signal=resolve;});
  const run=session.run('this.lamp_on=1; player:tell("pausing"); suspend(5); this.lamp_on=2;',{context,timeoutMs:10000,onOutput:()=>signal()});
  await started;run.stop();const result=await run.result;
  assert.equal(result.status,'cancelled');assert.equal(result.commit,'discarded');assert.equal(world.getProperty(42n,'lamp_on').value,0n);
 }finally{runtime.dispose();}
});
test('requests beyond five seconds are clamped by the builtin',async t=>{
 // Mock only the timer boundary: inspect the delay emitted by the real evaluator.
 const runtime=await createRuntime({profile:'toaststunt'});
 t.mock.timers.enable({apis:['setTimeout']});
 try{
  let done=false;const result=runtime.runAsync('return suspend(90);').then(r=>{done=true;return r;});
  t.mock.timers.tick(4999);await Promise.resolve();assert.equal(done,false);
  t.mock.timers.tick(1);const value=await result;assert.equal(value.status,'completed');assert.deepEqual(value.value,moo.int(0));
 }finally{runtime.dispose();}
});
