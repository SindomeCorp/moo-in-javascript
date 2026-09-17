import assert from 'node:assert/strict';
import {moo,createHostEnvironment} from '../../dist/index.js';
const I=moo.int,S=moo.string,L=(...v)=>moo.list(v);
const setup=w=>w.setEnvironment({...createHostEnvironment(),databases:[{id:1,path:'example',data:'',options:3,lastRowId:'0',open:true,limits:[100000,10000,100]}]});
const changed=w=>assert.equal(w.environment.time,1);
export const sqliteCases={
 sqlite_open:['sqlite_open("new")',I(2),changed],sqlite_close:['sqlite_close(1)',I(0),changed],sqlite_handles:['sqlite_handles()',L(I(1))],sqlite_info:['sqlite_info(1)',moo.map([['path',S('example')],['parse_types',I(1)],['parse_objects',I(1)],['sanitize_strings',I(0)],['locks',I(0)]].map(([k,v])=>[S(k),v]))],
 sqlite_query:['sqlite_query(1,"SELECT 42")',L(L(I(42)))],sqlite_execute:['sqlite_execute(1,"SELECT ?",{42})',L(L(I(42)))],sqlite_last_insert_row_id:['sqlite_last_insert_row_id(1)',I(0)],sqlite_limit:['sqlite_limit(1,"LIMIT_SQL_LENGTH",5000)',I(10000),changed],sqlite_interrupt:['sqlite_interrupt(1)',I(0)],
};
for(const testcase of Object.values(sqliteCases))testcase[3]=setup;
export const sqliteAvailable=(name,profile)=>profile==='toaststunt'||!name.startsWith('sqlite_');
