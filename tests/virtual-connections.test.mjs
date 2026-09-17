import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorld,createWorkerSession,createHostEnvironment,moo,HostError} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';
const I=moo.int,S=moo.string,O=moo.object,L=(...v)=>moo.list(v);
for(const profile of ['lambdamoo','toaststunt'])test(`${profile}: virtual connections, input, output, and checkpoints persist`,async()=>{
 const r=await createRuntime({profile}),world=createTestWorld({profile}),context={player:O(7)};
 const run=source=>{const result=r.run(source,{world,context});assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));return result.value;};
 try{
  assert.deepEqual(run('return connected_players();'),L());
  run('force_input(#7,"second"); force_input(#7,"first",1);');assert.deepEqual(run('return {connected_players(),read(),read(#7),read(#7,1)};'),L(L(O(7)),S('first'),S('second'),I(0)));
  assert.equal(r.run('return read(#7);',{world}).diagnostics[0].code,'E_INVARG');
  run('set_connection_option(#7,"hold-input",1); notify(#7,"hello");');assert.deepEqual(run('return {buffered_output_length(),buffered_output_length(#7)};'),L(I(5),I(5)));
  assert.ok(run('return connected_seconds(#7);').value>0n);assert.ok(run('return idle_seconds(#7);').value>0n);
  run('force_input(#7,"discard"); flush_input(#7,1);');assert.deepEqual(run('return read(#7,1);'),I(0));
  const saved=r.saveWorld(world);assert.equal(r.saveWorld(r.loadWorld(saved)),saved);
  const session=createWorkerSession({runtime:r,world,workerFactory:nodeWorkerFactory()});const result=await session.run('force_input(#7,"worker"); return read(#7);').result;assert.deepEqual(result.value,S('worker'));assert.ok(result.changes.some(c=>c.kind==='host-state'));
  run('server_log("test"); shutdown("requested"); dump_database();');assert.deepEqual(world.environment.logs,['test']);assert.equal(world.environment.shutdown,'requested');assert.ok(run('return db_disk_size();').value>0n);assert.equal(r.loadWorld(world.environment.checkpoint).valid(42n),true);
  const first=world.environment.checkpoint.length;run('dump_database();');assert.ok(world.environment.checkpoint.length<first+100);
  if(profile==='toaststunt'){
   assert.deepEqual(run('return connection_options(#7,"hold-input");'),I(1));assert.deepEqual(run('return connection_name(#7,1);'),S('virtual:7'));assert.deepEqual(run('return connection_name_lookup(#7,1);'),S('virtual:7'));
   run('switch_player(#7,#42,1);');assert.deepEqual(run('return connected_players();'),L(O(42)));run('boot_player(#42);');
  }else run('boot_player(#7);');
  assert.deepEqual(run('return connected_players();'),L());
  world.setEnvironment(createHostEnvironment({connections:[{player:7},{player:-2,name:'outbound'}]}));assert.deepEqual(run('return connected_players();'),L(O(7)));assert.deepEqual(run('return connected_players(1);'),L(O(7),O(-2)));
  for(const source of ['read(#999)','force_input(#999,"x")','connection_name(7)','set_connection_option(#7,"unknown",1)',...(profile==='toaststunt'?['server_version(1)','shutdown("x",1)','connection_options(#7,"unknown")','switch_player(#7,#-2)','switch_player(#7,#42,"bad")']:[])]){const result=r.run(source+';',{world,context});assert.equal(result.status,'runtime-error',source);}
  const snapshot=JSON.parse(r.saveWorld(world));snapshot.environment.connections[0].options.invalid=true;assert.throws(()=>r.loadWorld(snapshot),HostError);
  const duplicate=JSON.parse(r.saveWorld(world));duplicate.environment.connections.push(structuredClone(duplicate.environment.connections[0]));assert.throws(()=>r.loadWorld(duplicate),HostError);
 }finally{r.dispose();}
});
