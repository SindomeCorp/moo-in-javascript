import assert from 'node:assert/strict';
import {moo} from '../../dist/index.js';
const I=moo.int,S=moo.string,L=(...v)=>moo.list(v);
const entry=(path,kind,content='')=>({path,kind,content,mode:kind==='file'?'644':'755',created:1,accessed:2,modified:3});
export const fileSetup=w=>w.setEnvironment({version:1,time:10,nextHandle:2,files:[entry('/','directory'),entry('/lesson','file','ab\ncd\n'),entry('/empty','directory'),entry('/remove','file')],handles:[{id:1,path:'/lesson',mode:'r+tn',offset:0,eof:false}]});
const changed=w=>assert.equal(w.environment.time,11);
export const fileCases={
 file_handles:['file_handles()',L(I(1))],file_open:['file_open("/new","w+tn")',I(2),changed],file_close:['file_close(1)',I(0),changed],file_name:['file_name(1)',S('/lesson')],file_openmode:['file_openmode(1)',S('r+tn')],
 file_readline:['file_readline(1)',S('ab'),changed],file_readlines:['file_readlines(1,1,2)',L(S('ab'),S('cd')),changed],file_read:['file_read(1,3)',S('ab'),changed],file_write:['file_write(1,"xy")',I(2),changed],file_writeline:['file_writeline(1,"hello")',I(0),changed],file_grep:['file_grep(1,"CD")',L(L(S('cd'),I(2))),changed],file_seek:['file_seek(1,2,"SEEK_SET")',I(0),changed],file_tell:['file_tell(1)',I(0)],file_eof:['file_eof(1)',I(0)],file_flush:['file_flush(1)',I(0)],file_count_lines:['file_count_lines(1)',I(2),changed],
 file_list:['file_list("/")',L(S('empty'),S('lesson'),S('remove'))],file_mkdir:['file_mkdir("/dir")',I(0),changed],file_rmdir:['file_rmdir("/empty")',I(0),changed],file_remove:['file_remove("/remove")',I(0),changed],file_rename:['file_rename("/remove","/renamed")',I(0),changed],file_chmod:['file_chmod("/lesson","600")',I(0),changed],
 file_size:['file_size(1)',I(6)],file_mode:['file_mode("/lesson")',S('644')],file_type:['file_type(1)',S('reg')],file_last_access:['file_last_access(1)',I(2)],file_last_modify:['file_last_modify(1)',I(3)],file_last_change:['file_last_change(1)',I(1)],file_stat:['file_stat(1)',L(I(6),S('reg'),S('644'),S(''),S(''),I(2),I(3),I(1))],
};
for(const testcase of Object.values(fileCases))testcase[3]=fileSetup;
export const fileAvailable=(name,profile)=>profile==='toaststunt'||!name.startsWith('file_');
