import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorld,createWorkerSession,moo,HostError} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {fileSetup} from './helpers/file-cases.mjs';
const I=moo.int,S=moo.string,L=(...v)=>moo.list(v);
test('virtual file lifecycle, binary data, append, seek and directory operations',async t=>{
 const r=await createRuntime({profile:'toaststunt'}),world=createWorld({profile:'toaststunt'});
 const run=source=>{const result=r.run(source,{world});assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));return result.value;};
 try{
  assert.deepEqual(run('file_mkdir("notes"); f=file_open("notes/lesson","w+bn"); file_write(f,"a~00~FF~0Ab~0A"); file_seek(f,0,"seek_set"); return {file_readline(f),file_readline(f),file_readline(f),file_eof(f)};'),L(S('a~00~FF~0A'),S('b~0A'),S(''),I(1)));
  assert.deepEqual(run('file_seek(1,0,"SEEK_SET"); return {file_read(1,100),file_tell(1),file_eof(1)};'),L(S('a~00~FF~0Ab~0A'),I(6),I(1)));
  assert.deepEqual(run('file_seek(1,-1,"SEEK_END"); file_seek(1,-1,"SEEK_CUR"); return file_tell(1);'),I(4));
  assert.deepEqual(run('file_seek(1,9,"SEEK_SET"); file_write(1,"x"); file_seek(1,6,"SEEK_SET"); return file_read(1,4);'),S('~00~00~00x'));
  assert.deepEqual(run('file_close(1); f=file_open("/notes/lesson","a+tf"); file_seek(f,0,"SEEK_SET"); file_writeline(f,"end"); return file_size(f);'),I(14));
  run('file_rename("notes","renamed");');assert.deepEqual(run('return file_name(2);'),S('/renamed/lesson'));
  assert.deepEqual(run('return file_list("/renamed",1);'),L(L(S('lesson'),S('reg'),S('644'),I(14))));
  run('file_chmod("/renamed/lesson","600");');assert.deepEqual(run('return file_mode(2);'),S('600'));
  run('file_close(2); file_remove("/renamed/lesson"); file_rmdir("/renamed");');assert.deepEqual(run('return file_list("/");'),L());
  assert.equal(world.environment.files.length,1);assert.equal(Object.isFrozen(world.environment.files),true);
 }finally{r.dispose();}
});
test('virtual files reject invalid operations atomically and preserve state through controlled errors',async t=>{
 const r=await createRuntime({profile:'toaststunt'});
 try{
  for(const source of ['file_open("x","r")','file_open("../x","w+tn")','file_open("/absent/x","w+tn")','file_open("/lesson/x","w+tn")','file_open("/missing","r-tn")','file_open("/empty","r-tn")','file_close(999)','file_read(1,-1)','file_read(1,1000001)','file_seek(1,-1,"SEEK_SET")','file_seek(1,0,"bad")','file_remove("/lesson")','file_remove("/empty")','file_rmdir("/")','file_rmdir("/lesson")','file_list("/lesson")','file_mkdir("/empty")','file_chmod("/lesson","999")','file_rename("/lesson","/remove")','file_rename("/empty","/empty/x")','file_rename("/","/new")','file_size(#0)','file_readlines(1,0,0)','file_readlines(1,3,2)','file_readlines(1,1,-1)','file_grep(1,"x","bad")']){
   await t.test(source,()=>{const world=createWorld({profile:'toaststunt'});fileSetup(world);const before=r.saveWorld(world),result=r.run(source+';',{world});assert.equal(result.status,'runtime-error');assert.equal(r.saveWorld(world),before);});
  }
  const world=createWorld({profile:'toaststunt'});fileSetup(world);
  let result=r.run('file_seek(1,3,"SEEK_SET"); return {file_readlines(1,1,0),file_tell(1),file_count_lines(1),file_tell(1),file_grep(1,"",1)};',{world});
  assert.deepEqual(result.value,L(L(S('ab'),S('cd')),I(3),I(2),I(3),L(L(S('ab'),I(1)),L(S('cd'),I(2)))));
  result=r.run('f=file_open("/lesson","r-tn"); file_write(f,"x");',{world});assert.equal(result.diagnostics[0].code,'E_INVARG');assert.equal(world.environment.handles.length,2);
  result=r.run('f=file_open("/write","w-tn"); file_readline(f);',{world});assert.equal(result.diagnostics[0].code,'E_INVARG');assert.ok(world.environment.files.some(f=>f.path==='/write'));
  r.run('f=file_open("/binary","w+bn"); file_write(f,"~");',{world});assert.equal(world.environment.files.find(f=>f.path==='/binary').content,'');
  const saved=r.saveWorld(world);assert.equal(r.saveWorld(r.loadWorld(saved)),saved);
  const tiny=createWorld({profile:'toaststunt',limits:{stringUnits:30}});assert.equal(r.run('file_open("x","w+tn");',{world:tiny}).status,'limit-exceeded');assert.equal(tiny.environment,undefined);
 }finally{r.dispose();}
});
test('virtual host snapshots validate relationships and worker commits, cancellation, and reset',async()=>{
 const r=await createRuntime({profile:'toaststunt'}),world=createWorld({profile:'toaststunt'});fileSetup(world);
 try{
  const saved=r.saveWorld(world),parsed=JSON.parse(saved);
  const corruptions=[e=>e.version=2,e=>e.extra=true,e=>e.time=-1,e=>e.files[0].kind='file',e=>e.files[1].path='/missing/file',e=>e.files[1].path='/../x',e=>e.files[1].content=3,e=>e.files[1].mode='999',e=>e.files.push(structuredClone(e.files[1])),e=>e.handles[0].path='/missing',e=>e.handles[0].offset=-1,e=>e.handles[0].mode='r',e=>e.nextHandle=1,e=>e.handles.push(structuredClone(e.handles[0]))];
  for(const corrupt of corruptions){const snapshot=structuredClone(parsed);corrupt(snapshot.environment);assert.throws(()=>r.loadWorld(snapshot,{world}),HostError);assert.equal(r.saveWorld(world),saved);}
  const session=createWorkerSession({runtime:r,world,workerFactory:nodeWorkerFactory()});
  let result=await session.run('file_write(1,"XY"); return file_tell(1);').result;assert.deepEqual(result.value,I(2));assert.equal(world.environment.files.find(f=>f.path==='/lesson').content,'XY\ncd\n');assert.ok(result.changes.some(c=>c.kind==='host-state'));
  result=await session.run('return file_tell(1);').result;assert.deepEqual(result.changes,[]);
  const beforeStop=r.saveWorld(world),active=session.run('file_write(1,"discard"); while(1) endwhile',{limits:{steps:1000000000},timeoutMs:1000});active.stop();assert.equal((await active.result).status,'cancelled');assert.equal(r.saveWorld(world),beforeStop);
  result=await session.run('file_write(1,"KEEP"); raise(E_INVARG);').result;assert.equal(result.status,'runtime-error');assert.equal(world.environment.files.find(f=>f.path==='/lesson').content,'XYKEEP');
  session.reset();assert.equal(r.saveWorld(world),saved);
  const small=createWorld({profile:'toaststunt',limits:{objects:0,properties:0,verbs:0,valueNodes:0,stringUnits:10000}}),smallSession=createWorkerSession({runtime:r,world:small,workerFactory:nodeWorkerFactory()});
  result=await smallSession.run('return file_open("x","w+tn");').result;assert.equal(result.status,'completed');assert.ok(small.environment);
 }finally{r.dispose();}
});
