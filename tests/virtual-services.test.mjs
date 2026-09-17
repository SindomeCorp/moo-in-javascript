import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createHostEnvironment,createWorkerSession,moo,HostError} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';
const I=moo.int,S=moo.string,L=(...v)=>moo.list(v);
test('host fixtures, listeners, outbound queues and HTTP survive worker commits and snapshots',async()=>{
 const r=await createRuntime({profile:'toaststunt'}),world=createTestWorld({profile:'toaststunt'});
 const run=source=>{const result=r.run(source,{world});assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));return result.value;};
 try{
  world.setEnvironment(createHostEnvironment({fixtures:[{builtin:'open_network_connection',args:[S('example'),I(80)],result:L(S('HTTP/1.1 200 OK'),S('Content-Length: 2'),S(''),S('ok'))},{builtin:'getenv',args:[S('TOKEN')],result:S('fixture')}]}));
  assert.deepEqual(run('c=open_network_connection("example",80); notify(c,"request"); return read_http("response",c);'),moo.map([[S('status'),I(200)],[S('headers'),moo.map([[S('content-length'),S('2')]])],[S('body'),S('ok')]]));
  assert.deepEqual(world.environment.connections[0].output,['request']);
  run('listen(#7,1234,["print-messages"->1]);');assert.equal(world.environment.listeners[0].print,true);
  const saved=r.saveWorld(world);assert.equal(r.saveWorld(r.loadWorld(saved)),saved);
  const worker=createWorkerSession({runtime:r,world,workerFactory:nodeWorkerFactory()});const result=await worker.run('unlisten(1234); return getenv("TOKEN");').result;assert.deepEqual(result.value,S('fixture'));assert.deepEqual(world.environment.listeners,[]);
  assert.deepEqual(run('boot_player(#999); return listeners();'),L());
  for(const code of ['curl("missing")','exec({})','listen(#999,1234)','listen(#7,0)','listen(#7,1234,["tls"->1])','unlisten(1234)','unlisten(1234,1)','open_network_connection("example",80,["tls"->1])','open_network_connection("example",0)','read_http("invalid",#-2)']){
   const before=r.saveWorld(world),result=r.run(code+';',{world});assert.equal(result.status,'runtime-error',code);assert.equal(r.saveWorld(world),before,code);
  }
  for(const lines of [['GET / HTTP/1.1'],['GET / HTTP/1.1','Content-Length: 3','','x'],['GET / HTTP/1.1','Transfer-Encoding: chunked','',''],['GET / HTTP/1.1','X: a','X: b','',''],['bad','','']]){
   world.setEnvironment(createHostEnvironment({connections:[{player:7,input:lines}]}));const before=r.saveWorld(world);assert.equal(r.run('read_http("request",#7);',{world}).status,'runtime-error');assert.equal(r.saveWorld(world),before);
  }
  for(const state of [{...createHostEnvironment(),listeners:[{object:'-0',port:80,print:false}]},{...createHostEnvironment(),serverOptions:{fg_ticks:-1,fg_seconds:30}},{...createHostEnvironment(),fixtures:[{builtin:'invalid',args:[],result:{type:'int',value:'0'}}]}])assert.throws(()=>world.setEnvironment(state),HostError);
 }finally{r.dispose();}
});
test('server options apply to future runs and explicit execution limits override them',async()=>{
 const r=await createRuntime({profile:'toaststunt'}),world=createTestWorld({profile:'toaststunt'});try{
  world.addProperty(0n,'server_options',moo.object(42),7n,'r');world.addProperty(42n,'fg_ticks',I(0),7n,'r');
  assert.equal(r.run('load_server_options();',{world}).status,'completed');assert.equal(r.run('return 1;',{world}).status,'limit-exceeded');assert.deepEqual(r.run('return 1;',{world,limits:{steps:100}}).value,I(1));
 }finally{r.dispose();}
});
