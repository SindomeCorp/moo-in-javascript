import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorkerSession,moo} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';

for(const profile of ['lambdamoo','toaststunt']) {
 test(`${profile}: value_bytes accepts every supported value and always returns the documented placeholder`,async()=>{
  const runtime=await createRuntime({profile});
  try {
   const values=['0','1.5','""','"longer text"','E_TYPE','#7','#999','{}','{1,{2,"three"}}',...(profile==='toaststunt'?['[]','["key" -> {1,2}]']:[])];
   for(const value of values) {
    const result=runtime.run(`return value_bytes(${value});`);
    assert.equal(result.status,'completed',value);assert.deepEqual(result.value,moo.int(0));
    assert.deepEqual(result.output,[]);assert.deepEqual(result.changes,[]);
   }
   for(const name of ['value_bytes','object_bytes']) {
    const info=runtime.getBuiltinInfo(name);
    assert.match(info.summary,/Stub/);assert.match(info.returns.description,/placeholder/);
    assert.equal(info.minArgs,1);assert.equal(info.maxArgs,1);
   }
  }finally{runtime.dispose();}
 });
 test(`${profile}: object_bytes validates references and does not measure or mutate valid objects`,async()=>{
  const runtime=await createRuntime({profile}),world=createTestWorld({profile});
  try {
   const before=runtime.saveWorld(world);
   const result=runtime.run('return {object_bytes(#0), object_bytes(#7), object_bytes(#42)};',{world});
   assert.equal(result.status,'completed');assert.deepEqual(result.value,moo.list([moo.int(0),moo.int(0),moo.int(0)]));
   assert.deepEqual(result.output,[]);assert.deepEqual(result.changes,[]);assert.equal(runtime.saveWorld(world),before);
   world.addProperty(42n,'large',moo.string('x'.repeat(10000)),7n,'r');
   assert.deepEqual(runtime.run('return object_bytes(#42);',{world}).value,moo.int(0));
   for(const source of ['object_bytes(#999)','object_bytes(#-1)']) {
    const failure=runtime.run(`return ${source};`,{world});
    assert.equal(failure.status,'runtime-error');assert.equal(failure.diagnostics[0].code,'E_INVIND');
   }
   for(const value of ['1','"#42"','{}','E_TYPE'])assert.equal(runtime.run(`return object_bytes(${value});`,{world}).diagnostics[0].code,'E_TYPE');
   world.recycle(42n);
   assert.equal(runtime.run('return object_bytes(#42);',{world}).diagnostics[0].code,'E_INVIND');
   assert.deepEqual(runtime.run('return value_bytes(#42);',{world}).value,moo.int(0));
  }finally{runtime.dispose();}
 });
 test(`${profile}: memory stubs enforce arity and agree in workers`,async()=>{
  const runtime=await createRuntime({profile}),world=createTestWorld({profile});
  try {
   for(const name of ['object_bytes','value_bytes'])for(const args of ['', '#7,#42'])assert.equal(runtime.run(`return ${name}(${args});`,{world}).diagnostics[0].code,'E_ARGS');
   const session=createWorkerSession({runtime,world,workerFactory:nodeWorkerFactory()}),before=session.save();
   const source='return {value_bytes({1,"text",#999}), object_bytes(#42)};';
   const direct=runtime.run(source,{world}),worker=await session.run(source).result;
   assert.equal(worker.status,'completed');assert.deepEqual(worker.value,direct.value);
   assert.deepEqual(worker.output,[]);assert.deepEqual(worker.changes,[]);assert.equal(session.save(),before);
   const invalid=await session.run('return object_bytes(#999);').result;
   assert.equal(invalid.diagnostics[0].code,'E_INVIND');assert.equal(session.save(),before);
  }finally{runtime.dispose();}
 });
}
