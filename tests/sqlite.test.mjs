import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorld,createWorkerSession,moo,HostError} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
const I=moo.int,S=moo.string,O=moo.object,L=(...v)=>moo.list(v);
test('SQLite executes real statements, preserves data and supports bound parameters',async()=>{
 const r=await createRuntime({profile:'toaststunt'}),world=createWorld({profile:'toaststunt'});
 const run=source=>{const result=r.run(source,{world});assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));return result.value;};
 try{
  assert.deepEqual(run('return sqlite_open("lesson.db");'),I(1));assert.deepEqual(run('return sqlite_query(1,"CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT, owner TEXT)");'),L());
  assert.deepEqual(run('return sqlite_execute(1,"INSERT INTO notes VALUES (?, ?, ?)",{1,"hello",#7});'),L());assert.deepEqual(run('return sqlite_query(1,"SELECT id, title, owner FROM notes");'),L(L(I(1),S('hello'),O(7))));
  assert.deepEqual(run('return sqlite_query(1,"SELECT title FROM notes",1);'),L(L(L(S('title'),S('hello')))));
  assert.deepEqual(run('return sqlite_last_insert_row_id(1);'),I(1));
  run('sqlite_execute(1,"UPDATE notes SET title=? WHERE id=1",{"changed"});');assert.deepEqual(run('return sqlite_query(1,"SELECT upper(title) FROM notes WHERE id=1");'),L(L(S('CHANGED'))));
  assert.deepEqual(run('return sqlite_query(1,"SELECT 9223372036854775807, 1.25, NULL");'),L(L(I(9223372036854775807n),moo.float(1.25),S('NULL'))));
  run(`sqlite_query(1,"INSERT INTO notes VALUES (9007199254740993, 'large', '#7')");`);assert.deepEqual(run('return sqlite_last_insert_row_id(1);'),I(9007199254740993n));
  run('sqlite_query(1,"DELETE FROM notes WHERE id=9007199254740993");');assert.deepEqual(run('return sqlite_last_insert_row_id(1);'),I(9007199254740993n));
  const saved=r.saveWorld(world);assert.equal(r.saveWorld(r.loadWorld(saved)),saved);
  const session=createWorkerSession({runtime:r,world,workerFactory:nodeWorkerFactory()});const result=await session.run('sqlite_execute(1,"INSERT INTO notes VALUES (?, ?, ?)",{2,"worker",#42}); return sqlite_query(1,"SELECT count(*) FROM notes");').result;assert.deepEqual(result.value,L(L(I(2))));
  run('sqlite_close(1);');assert.deepEqual(run('return sqlite_handles();'),L());assert.deepEqual(run('return sqlite_open("lesson.db",0);'),I(1));assert.deepEqual(run('return sqlite_query(1,"SELECT id FROM notes ORDER BY id");'),L(L(S('1')),L(S('2'))));
  run('sqlite_query(1,"DELETE FROM notes WHERE id=2");');assert.deepEqual(run('return sqlite_query(1,"SELECT count(*) FROM notes");'),L(L(S('1'))));
  assert.equal(run('return sqlite_query(1,"SELECT unknown FROM notes");').type,'string');
  run('sqlite_query(1,"DROP TABLE notes");');assert.equal(run('return sqlite_query(1,"SELECT * FROM notes");').type,'string');
  run('sqlite_close(1);');assert.deepEqual(run('return sqlite_open(":memory:");'),I(2));run('sqlite_close(2);');assert.equal(world.environment.databases.length,1);
 }finally{r.dispose();}
});
test('SQLite rejects unbounded constructs and preserves databases on errors and limits',async()=>{
 const r=await createRuntime({profile:'toaststunt'}),world=createWorld({profile:'toaststunt'});
 try{
  r.run('sqlite_open("test");',{world});
  for(const sql of ['WITH RECURSIVE x(n) AS (SELECT 1) SELECT * FROM x','SELECT randomblob(1000000000)','SELECT 1; SELECT 2','SELECT * FROM a,b','SELECT (SELECT 1)','SELECT 1 UNION SELECT 2','PRAGMA journal_mode','CREATE TRIGGER bad','CREATE TABLE t(x DEFAULT(randomblob(1000000)))','INSERT INTO t VALUES(randomblob(1000000))','SELECT 1 -- hi']){
   const before=r.saveWorld(world),result=r.run(`return sqlite_query(1,${JSON.stringify(sql)});`,{world});assert.equal(result.status,'runtime-error',sql);assert.equal(r.saveWorld(world),before);
  }
  for(const source of ['sqlite_open("test")','sqlite_open("x",8)','sqlite_query(999,"SELECT 1")','sqlite_limit(1,99,1)','sqlite_execute(1,"SELECT ?",{{}})','sqlite_execute(1,"SELECT ?",{9223372036854775807})'])assert.equal(r.run(source+';',{world}).status,'runtime-error',source);
  assert.deepEqual(r.run('return sqlite_limit(1,1,-1);',{world}).value,I(10000));assert.deepEqual(r.run('return sqlite_limit(1,"LIMIT_SQL_LENGTH",5);',{world}).value,I(10000));assert.equal(r.run('sqlite_query(1,"SELECT 1");',{world}).diagnostics[0].code,'E_QUOTA');
  const saved=JSON.parse(r.saveWorld(world));saved.environment.databases[0].data='!';assert.throws(()=>r.loadWorld(saved),HostError);
  assert.equal(r.run('return sqlite_handles();',{world,limits:{allocations:1}}).status,'limit-exceeded');
 }finally{r.dispose();}
});
