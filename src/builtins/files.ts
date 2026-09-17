import type { Utility } from './utilities.js';
import { str,int,text } from './utilities.js';
import { binaryDecode,binaryEncode } from './codecs.js';
import { moo,type MooValue } from '../values/index.js';
import { truth,fold } from '../values/operations.js';
import { fail } from '../runtime/errors.js';
import type { Execution } from '../runtime/execution.js';
import { initialEnvironment,type VirtualFile } from '../host/environment.js';
const p=(name:string,type:Utility['returns'],optional=false)=>({name,types:[type],optional,description:name+'.'});
const handle=()=>p('handle','int'),path=()=>p('path','string');
const specs:[string,Utility['parameters'],Utility['returns']][]=[
 ['file_handles',[],'list'],['file_open',[path(),p('mode','string')],'int'],
 ...['close','flush','tell','eof','count_lines'].map(n=>['file_'+n,[handle()],'int'] as [string,Utility['parameters'],Utility['returns']]),
 ...['name','openmode','readline'].map(n=>['file_'+n,[handle()],'string'] as [string,Utility['parameters'],Utility['returns']]),
 ['file_readlines',[handle(),p('start','int'),p('end','int')],'list'],['file_read',[handle(),p('count','int')],'string'],
 ['file_write',[handle(),p('data','string')],'int'],['file_writeline',[handle(),p('data','string')],'int'],['file_grep',[handle(),p('substring','string'),p('all','int',true)],'list'],
 ['file_seek',[handle(),p('offset','int'),p('whence','string')],'int'],['file_list',[path(),p('details','any',true)],'list'],
 ...['mkdir','rmdir','remove'].map(n=>['file_'+n,[path()],'int'] as [string,Utility['parameters'],Utility['returns']]),
 ['file_rename',[path(),p('destination','string')],'int'],['file_chmod',[path(),p('mode','string')],'int'],
 ...['size','last_access','last_modify','last_change'].map(n=>['file_'+n,[p('file','any')],'int'] as [string,Utility['parameters'],Utility['returns']]),
 ...['mode','type'].map(n=>['file_'+n,[p('file','any')],'string'] as [string,Utility['parameters'],Utility['returns']]),
 ['file_stat',[p('file','any')],'list'],
];
export const fileBuiltins:Omit<Utility,'invoke'>[]=specs.map(([name,parameters,returns])=>({name,parameters,returns,profiles:['toaststunt'],summary:'Simulated filesystem: '+name.slice(5).replaceAll('_',' ')+'.',notes:[
 'Stateful virtual filesystem, saved with the world; never accesses host files. Modes are r/w/a, +/- , t/b, f/n (for example r+tn). Paths are rooted at /; .. is rejected.',
 'Files and handles persist across runs, workers and saves. Flush is immediate. Permissions are metadata only; timestamps are logical operation counters. Errors use E_INVARG. Text reads remove nonprintable bytes; binary I/O uses ~XX strings.',
 'Directories report size 0. Removing open files or overwriting existing rename destinations is rejected. file_openmode returns the original mode. file_readline at EOF returns an empty string with EOF set. file_readlines uses inclusive one-based line numbers and restores the starting offset.',
]}));
function normalize(source:string):string {if(/[\x00-\x1f]/.test(source)||source.split('/').includes('..'))fail('E_INVARG','Invalid virtual path');return '/'+source.split('/').filter(p=>p&&p!=='.').join('/');}
export function invokeFileBuiltin(name:string,args:MooValue[],execution:Execution):MooValue {
 const {world,budget}=execution,original=world.environment??initialEnvironment();
 const size=JSON.stringify(original).length;budget.step(size);budget.allocate(size);
 const state=structuredClone(original),a=args[0]!,b=args[1]!,c=args[2]!;
 const file=(path:string)=>state.files.find(f=>f.path===path)??fail('E_INVARG','Virtual file does not exist');
 const h=(v:MooValue)=>{const id=int(v);return state.handles.find(h=>BigInt(h.id)===id)??fail('E_INVARG','Invalid virtual file handle');};
 const parent=(path:string)=>{if(file(path.slice(0,path.lastIndexOf('/'))||'/').kind!=='directory')fail('E_INVARG');};
 const commit=(result:MooValue=moo.int(0))=>{state.time++;world.setEnvironment(state,budget);return result;};
 const type=(f:VirtualFile)=>f.kind==='file'?'reg':'dir';
 const stat=(f:VirtualFile)=>moo.list([moo.int(f.content.length),moo.string(type(f)),moo.string(f.mode),moo.string(''),moo.string(''),moo.int(f.accessed),moo.int(f.modified),moo.int(f.created)]);
 if(name==='file_handles'){budget.allocate(state.handles.length);return moo.list(state.handles.map(h=>moo.int(h.id)));}
 if(name==='file_open'){
  const path=normalize(str(a)),mode=str(b);if(!/^[rwa][+\-][tb][fn]$/.test(mode))fail('E_INVARG','Invalid virtual file mode');parent(path);
  let f=state.files.find(f=>f.path===path);if(!f){if(mode[0]==='r')fail('E_INVARG');f={path,kind:'file',content:'',mode:'644',created:state.time,accessed:state.time,modified:state.time};state.files.push(f);}
  if(f.kind!=='file')fail('E_INVARG');if(mode[0]==='w'){f.content='';f.modified=state.time;}
  if(state.handles.length>=256||!Number.isSafeInteger(state.nextHandle+1))fail('E_QUOTA');const id=state.nextHandle++;state.handles.push({id,path,mode,offset:mode[0]==='a'?f.content.length:0,eof:false});return commit(moo.int(id));
 }
 if(['file_size','file_type','file_mode','file_stat','file_last_access','file_last_modify','file_last_change'].includes(name)){
  if(a.type!=='string'&&a.type!=='int')fail('E_TYPE');const f=file(a.type==='int'?h(a).path:normalize(str(a)));
  switch(name){case 'file_size':return moo.int(f.content.length);case 'file_type':return moo.string(type(f));case 'file_mode':return moo.string(f.mode);case 'file_stat':budget.allocate(8);return stat(f);case 'file_last_access':return moo.int(f.accessed);case 'file_last_modify':return moo.int(f.modified);default:return moo.int(f.created);}
 }
 if(['file_list','file_mkdir','file_rmdir','file_remove','file_rename','file_chmod'].includes(name)){
  const path=normalize(str(a));
  if(name==='file_mkdir'){if(state.files.some(f=>f.path===path))fail('E_INVARG');parent(path);state.files.push({path,kind:'directory',content:'',mode:'755',created:state.time,accessed:state.time,modified:state.time});return commit();}
  const f=file(path);
  if(name==='file_list'){if(f.kind!=='directory')fail('E_INVARG');const prefix=path==='/'?'/':path+'/';const entries=state.files.filter(f=>f.path.startsWith(prefix)&&f.path!==path&&!f.path.slice(prefix.length).includes('/')).sort((a,b)=>a.path<b.path?-1:1);budget.allocate(entries.length*5);return moo.list(entries.map(f=>b&&truth(b)?moo.list([moo.string(f.path.slice(prefix.length)),moo.string(type(f)),moo.string(f.mode),moo.int(f.content.length)]):moo.string(f.path.slice(prefix.length))));}
  if(name==='file_chmod'){const mode=str(b);if(!/^[0-7]{3}$/.test(mode))fail('E_INVARG');f.mode=mode;f.created=state.time;return commit();}
  if(name==='file_rename'){const destination=normalize(str(b));if(path==='/'||destination.startsWith(path+'/')||state.files.some(f=>f.path===destination))fail('E_INVARG');parent(destination);for(const entry of state.files)if(entry.path===path||entry.path.startsWith(path+'/'))entry.path=destination+entry.path.slice(path.length);for(const handle of state.handles)if(handle.path===path||handle.path.startsWith(path+'/'))handle.path=destination+handle.path.slice(path.length);return commit();}
  if(path==='/'||f.kind!==(name==='file_rmdir'?'directory':'file')||state.files.some(f=>f.path.startsWith(path+'/'))||state.handles.some(h=>h.path===path))fail('E_INVARG');state.files=state.files.filter(f=>f.path!==path);return commit();
 }
 const handle=h(a),f=file(handle.path);
 switch(name){
  case 'file_name':return text(handle.path,budget);
  case 'file_openmode':return moo.string(handle.mode);
  case 'file_close':state.handles=state.handles.filter(h=>h.id!==handle.id);return commit();
  case 'file_flush':return moo.int(0);
  case 'file_tell':return moo.int(handle.offset);
  case 'file_eof':return moo.int(handle.eof?1:0);
  case 'file_seek':{const amount=int(b),whence=fold(str(c));const base=whence==='seek_set'?0:whence==='seek_cur'?handle.offset:whence==='seek_end'?f.content.length:fail('E_INVARG');const offset=BigInt(base)+amount;if(offset<0n||offset>BigInt(world.limits.stringUnits))fail('E_INVARG');handle.offset=Number(offset);handle.eof=false;return commit();}
  case 'file_write':case 'file_writeline':{
   if(handle.mode[0]==='r'&&handle.mode[1]!=='+')fail('E_INVARG','File is read-only');let source=str(b);
   if(handle.mode[2]==='b'){let decoded='';for(const byte of binaryDecode(source,budget))decoded+=String.fromCharCode(byte);source=decoded;}
   if(name==='file_writeline')source+='\n';if(handle.mode[0]==='a')handle.offset=f.content.length;
   const length=Math.max(f.content.length,handle.offset+source.length);budget.allocate(length);budget.step(length);if(length>world.limits.stringUnits)fail('E_QUOTA');
   f.content=f.content.slice(0,handle.offset)+'\0'.repeat(Math.max(0,handle.offset-f.content.length))+source+f.content.slice(handle.offset+source.length);handle.offset+=source.length;f.modified=state.time;f.created=state.time;return commit(moo.int(name==='file_write'?source.length:0));
  }
 }
 if(handle.mode[0]!=='r'&&handle.mode[1]!=='+')fail('E_INVARG','File is write-only');
 const readText=(source:string):MooValue=>handle.mode[2]==='b'?binaryEncode(Array.from(source,c=>c.charCodeAt(0)),budget):text(source.replace(/[^\x20-\x7e\t]/g,''),budget);
 const line=():string|undefined=>{if(handle.offset>=f.content.length){handle.eof=true;return undefined;}const start=handle.offset,end=f.content.indexOf('\n',start);handle.offset=end<0?f.content.length:end+1;if(end<0)handle.eof=true;return f.content.slice(start,handle.offset);};
 f.accessed=state.time;
 if(name==='file_read'){const count=int(b);if(count<0n||count>BigInt(world.limits.stringUnits))fail('E_INVARG');const data=f.content.slice(handle.offset,handle.offset+Number(count));handle.offset+=data.length;handle.eof=data.length<Number(count);return commit(readText(data));}
 if(name==='file_readline')return commit(readText(line()??''));
 const startOffset=handle.offset,startEof=handle.eof;handle.offset=0;handle.eof=false;let index=0;const out:MooValue[]=[];
 const start=name==='file_readlines'?int(b):1n,end=name==='file_readlines'?int(c):0n;if(start<1n||end<0n||(end!==0n&&end<start))fail('E_INVARG');
 const needle=name==='file_grep'?fold(str(b)):'';if(name==='file_grep'&&c)int(c);
 while(true){budget.step();const data=line();if(data===undefined)break;index++;
  if(name==='file_count_lines')continue;
  if(name==='file_readlines'){if(BigInt(index)>=start&&(end===0n||BigInt(index)<=end)){budget.allocate(1);out.push(readText(data));}if(end!==0n&&BigInt(index)>=end)break;}
  else if(fold(data).includes(needle)){budget.allocate(3);out.push(moo.list([readText(data.replace(/\n$/,'')),moo.int(index)]));if(!c||!truth(c))break;}
 }
 if(name!=='file_grep'){handle.offset=startOffset;handle.eof=startEof;}
 return commit(name==='file_count_lines'?moo.int(index):moo.list(out));
}
