import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorkerSession,moo,WorkerHostError,HostError} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';

function transport() {
  let receive, reject, request;
  return {factory:()=>({subscribe(m,e){receive=m;reject=e;return ()=>{};},postMessage(r){request=r;},terminate(){}}),
    send(message){receive(message);}, crash(error){reject(error);}, get request(){return request;}};
}
const statistics={steps:1,allocations:0,peakEvaluationDepth:1,peakCallDepth:1,outputCharacters:0,outputEvents:0};
function terminal(id,snapshot,outputCount=0) {
  return {type:'terminal',id,snapshot,outputCount,result:{status:'completed',commit:'committed',statistics,value:{type:'int',value:'9'},diagnostics:[]}};
}
function event(id,sequence=0) {return {type:'output',id,event:{runId:id,sequence,text:'delivered',recipient:{type:'object',value:'7'}}};}
for(const profile of ['lambdamoo','toaststunt']) {
  test(`${profile}: malformed worker messages never commit and release the world`,async t=>{
    const runtime=await createRuntime({profile});
    try {
      const faults=[
        ['out of order output',(id,s)=>({...event(id),event:{...event(id).event,sequence:3}})],
        ['duplicate output',(id,s)=>event(id,0)],
        ['wrong event run ID',(id,s)=>({...event(id,1),event:{...event(id,1).event,runId:'other'}})],
        ['non-string output',(id,s)=>({...event(id,1),event:{...event(id,1).event,text:8}})],
        ['non-object recipient',(id,s)=>({...event(id,1),event:{...event(id,1).event,recipient:{type:'int',value:'7'}}})],
        ['incomplete transfer',(id,s)=>terminal(id,s,2)],
        ['invalid snapshot',(id,s)=>terminal(id,'broken',1)],
        ['malformed value',(id,s)=>({...terminal(id,s,1),result:{...terminal(id,s).result,value:{type:'int',value:'bad'}}})],
        ['invalid terminal status',(id,s)=>({...terminal(id,s,1),result:{...terminal(id,s).result,status:'mystery'}})],
        ['invalid commit flag',(id,s)=>({...terminal(id,s,1),result:{...terminal(id,s).result,commit:'discarded'}})],
        ['invalid discarded status',(id,s)=>({...terminal(id,s,1),result:{status:'syntax-error',commit:'committed',statistics,diagnostics:[]}})],
        ['invalid traceback',(id,s)=>({...terminal(id,s,1),result:{status:'runtime-error',commit:'committed',statistics,diagnostics:[{stack:[{this:'bad'}]}]}})],
        ['host failure',(id,s)=>({type:'host-error',id,message:'worker initialization failed'})],
        ['null message',()=>null],
        ['missing envelope ID',()=>({type:'terminal'})],
        ['unknown message type',(id)=>({id,type:'unknown'})],
      ];
      for(const [name,fault] of faults) await t.test(name,async()=>{
        const world=createTestWorld({profile}), before=runtime.saveWorld(world), fake=transport();
        const candidate=runtime.loadWorld(before);candidate.setProperty(42n,'lamp_on',moo.int(99));
        const session=createWorkerSession({runtime,world,workerFactory:fake.factory});
        const delivered=[];const run=session.run('return 9;',{onOutput:e=>delivered.push(e)});
        const rejected=assert.rejects(run.result,e=>e instanceof WorkerHostError && e.commit==='unavailable' && e.output.length===1);
        fake.send(event(fake.request.id));
        assert.doesNotThrow(()=>fake.send(fault(fake.request.id,runtime.saveWorld(candidate))));
        await rejected;
        assert.equal(runtime.saveWorld(world),before);assert.equal(session.busy,false);assert.equal(delivered.length,1);
        const retry=session.run('return 9;');fake.send(terminal(fake.request.id,before));
        assert.equal((await retry.result).value.value,9n);
      });
    } finally {runtime.dispose();}
  });
  test(`${profile}: ignored, duplicate, and late messages do not change an outcome`,async()=>{
    const runtime=await createRuntime({profile});
    try {
      const world=createTestWorld({profile}),fake=transport(),before=runtime.saveWorld(world);
      const session=createWorkerSession({runtime,world,workerFactory:fake.factory});
      const run=session.run('return 9;');
      fake.send(terminal('unrelated', 'broken'));assert.equal(session.busy,true);
      fake.send(terminal(fake.request.id,before));assert.equal((await run.result).status,'completed');
      fake.send(terminal(fake.request.id,'broken'));fake.crash(new Error('late crash'));run.stop();
      assert.equal(session.save(),before);assert.equal(session.busy,false);
      const cancelled=session.run('return 9;');const id=fake.request.id;cancelled.stop();await cancelled.result;
      fake.send(terminal(id,'broken'));assert.equal(session.save(),before);
    } finally {runtime.dispose();}
  });
  test(`${profile}: worker context and nested call diagnostics match direct execution`,async()=>{
    const runtime=await createRuntime({profile});
    try {
      const world=createTestWorld({profile}),direct=createTestWorld({profile});
      const session=createWorkerSession({runtime,world,workerFactory:nodeWorkerFactory()});
      const context={this:moo.object(42),player:moo.object(7),caller:moo.object(1),verb:'custom-name',args:[moo.list([moo.string('payload'),moo.object(1),moo.float(-0)])]};
      const source='notify(player, verb); return {this,player,caller,verb,args};';
      const expected=moo.list([context.this,context.player,context.caller,moo.string(context.verb),moo.list(context.args)]);
      const a=runtime.run(source,{world:direct,context}),b=await session.run(source,{context}).result;
      assert.deepEqual(a.value,expected);assert.deepEqual(b.value,expected);
      assert.deepEqual(b.output.map(e=>[e.recipient,e.text]),[[moo.object(7),'custom-name']]);
      assert.deepEqual(b.changes,[]);
      for(const w of [world,direct]) w.addVerb(1n,{names:'bad',owner:7n,perms:'rx',args:['none','none','none'],source:'return 1/0;'});
      const directError=runtime.run('return this:bad();',{world:direct,context});
      const workerError=await session.run('return this:bad();',{context}).result;
      assert.deepEqual(workerError.diagnostics,directError.diagnostics);
    } finally {runtime.dispose();}
  });
}
for(const phase of ['factory','subscribe','postMessage']) test(`transport ${phase} failure unlocks the world`,async()=>{
  const runtime=await createRuntime({profile:'lambdamoo'}),world=createTestWorld({profile:'lambdamoo'});
  try {
    const before=runtime.saveWorld(world);
    const session=createWorkerSession({runtime,world,workerFactory:()=>{
      if(phase==='factory')throw new Error(phase);
      return {subscribe(){if(phase==='subscribe')throw new Error(phase);return ()=>{throw new Error('cleanup');};},postMessage(){throw new Error(phase);},terminate(){throw new Error('cleanup');}};
    }});
    await assert.rejects(session.run('return 1;').result,WorkerHostError);
    assert.equal(session.busy,false);assert.equal(runtime.saveWorld(world),before);
    assert.equal(runtime.run('return 7;',{world}).value.value,7n);
  } finally {runtime.dispose();}
});
test('concurrent worker sessions cannot share an executing world',async()=>{
  const runtime=await createRuntime({profile:'toaststunt'}),world=createTestWorld({profile:'toaststunt'}),fake=transport();
  try {
    const first=createWorkerSession({runtime,world,workerFactory:fake.factory});
    const second=createWorkerSession({runtime,world,workerFactory:fake.factory});
    const run=first.run('return 1;');
    assert.throws(()=>first.run('return 2;'),HostError);assert.throws(()=>second.run('return 2;'),HostError);
    run.stop();await run.result;
    const retry=second.run('return 9;');fake.send(terminal(fake.request.id,runtime.saveWorld(createTestWorld({profile:'toaststunt'}))));
    assert.equal((await retry.result).value.value,9n);
  }finally{runtime.dispose();}
});
