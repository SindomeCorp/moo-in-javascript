import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorld,createWorkerSession,moo} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
test('ToastCore conditional splicing and native iteration semantics',async()=>{
 const r=await createRuntime({profile:'toaststunt'});
 try{
  for(const [source,expected] of [
   ['return {@1 ? {2,3} | {}, 4};',moo.list([moo.int(2),moo.int(3),moo.int(4)])],
   ['return tostr(@0 ? {"bad"} | {"yes"}, "!");',moo.string('yes!')],
   ['r={};for v,k in (["b"->2,"a"->1]) r={@r,{k,v}};endfor return r;',moo.list([moo.list([moo.string('a'),moo.int(1)]),moo.list([moo.string('b'),moo.int(2)])])],
   ['r={};for v in (["a"->5]) r={@r,v};endfor return r;',moo.list([moo.int(5)])],
   ['r={};for v,k in ("ab") r={@r,{k,v}};endfor return r;',moo.list([moo.list([moo.int(1),moo.string('a')]),moo.list([moo.int(2),moo.string('b')])])],
   ['return {WAIF,ANON,typeof(#1)==WAIF};',moo.list([moo.int(13),moo.int(12),moo.int(0)])],
  ]){const result=r.run(source);assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));assert.deepEqual(result.value,expected);}
 }finally{r.dispose();}
});
test('retain source is opt in and unsupported nested execution rolls back in workers',async()=>{
 const r=await createRuntime({profile:'toaststunt'});
 try{
  const w=createWorld({profile:'toaststunt'});w.addObject({id:1,name:'Original'});
  w.addVerb(1n,{names:'later',owner:1n,perms:'rx',args:['this','none','this'],source:'fork (0) return 1; endfork'});
  const snapshot=r.saveWorld(w);assert.throws(()=>r.loadWorld(snapshot),/does not compile/);
  const loaded=r.loadWorld(snapshot,{unsupportedSourcePolicy:'retain'});assert.equal(r.saveWorld(loaded),snapshot);
  const result=await createWorkerSession({runtime:r,world:loaded,unsupportedSourcePolicy:'retain',workerFactory:nodeWorkerFactory()}).run('#1.name="Changed"; return #1:later();').result;
  assert.equal(result.status,'unsupported-feature');assert.equal(result.commit,'discarded');assert.equal(r.saveWorld(loaded),snapshot);
  const broken=JSON.parse(snapshot);broken.objects[0].verbs[0].source='if (';
  assert.throws(()=>r.loadWorld(broken,{unsupportedSourcePolicy:'retain'}),/does not compile/);
 }finally{r.dispose();}
});
test('native ToastStunt errors retain their numeric identities and are profile gated',async()=>{
 const toast=await createRuntime({profile:'toaststunt'}),lambda=await createRuntime({profile:'lambdamoo'});
 try{
  const result=toast.run('return {toint(E_FILE),toint(E_EXEC),toint(E_INTRPT)};');
  assert.equal(result.status,'completed');assert.deepEqual(result.value,moo.list([moo.int(16),moo.int(17),moo.int(18)]));
  assert.deepEqual(toast.run('return tostr(E_EXEC);').value,moo.string('Exec error'));
  assert.equal(lambda.compile('return E_FILE;').ok,false);
 }finally{toast.dispose();lambda.dispose();}
});
test('snapshot validation cache cannot reuse validation after verb source changes',async()=>{
 const r=await createRuntime({profile:'toaststunt'});
 try{
  const w=createWorld({profile:'toaststunt'});w.addObject({id:1});
  w.addVerb(1n,{names:'value',owner:1n,perms:'rx',args:['this','none','this'],source:'return 1;'});
  const snapshot=JSON.parse(r.saveWorld(w));r.loadWorld(snapshot);r.loadWorld(snapshot);
  snapshot.objects[0].verbs[0].source='return 2;';
  assert.deepEqual(r.run('return #1:value();',{world:r.loadWorld(snapshot)}).value,moo.int(2));
  snapshot.objects[0].verbs[0].source='if (';assert.throws(()=>r.loadWorld(snapshot),/does not compile/);
 }finally{r.dispose();}
});
