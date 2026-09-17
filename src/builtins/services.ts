import type { Utility } from './utilities.js';
import { str,int,lst,text } from './utilities.js';
import { moo,encodeValue,decodeValue,type MooValue } from '../values/index.js';
import { truth,fold,equal } from '../values/operations.js';
import { fail,MooError } from '../runtime/errors.js';
import type { Execution } from '../runtime/execution.js';
import { initialEnvironment,virtualConnection } from '../host/environment.js';
const p=(name:string,type:Utility['returns'],optional=false)=>({name,types:[type],optional,description:name+'.'});
const specs:[string,Utility['parameters'],Utility['returns'],boolean?][]=[
 ['curl',[p('url','string'),p('includeHeaders','any',true),p('timeout','int',true)],'any',true],
 ['exec',[p('command','list'),p('input','string',true),p('environment','list',true)],'list',true],
 ['getenv',[p('name','string')],'any',true],['spellcheck',[p('word','string')],'any',true],
 ['open_network_connection',[p('host','string'),p('port','int'),p('options','map',true)],'object'],
 ['listen',[p('object','object'),p('port','any'),p('options','map',true)],'int'],['unlisten',[p('port','any'),p('ipv6','any',true)],'int'],['listeners',[p('filter','any',true)],'list'],
 ['read_http',[p('kind','string'),p('connection','object',true)],'map',true],['load_server_options',[],'int',true],
];
export const serviceBuiltins:Omit<Utility,'invoke'>[]=specs.map(([name,parameters,returns,toast])=>({name,parameters,returns,...(toast?{profiles:['toaststunt'] as ['toaststunt']}:{}),summary:'Simulated host: '+name.replaceAll('_',' ')+'.',notes:[
 'curl, exec, getenv, spellcheck and outbound connections use exact argument fixtures configured with createHostEnvironment(). Missing fixtures raise E_INVARG; no network, process, environment-variable or dictionary access occurs.',
 'Outbound connection fixtures supply a list of input strings. listen/unlisten maintain virtual port registrations only; TLS/IPv6 and nonempty outbound options are unsupported. Listener options support print-messages only. No login/lifecycle hooks are dispatched.',
 'read_http parses one complete HTTP/1.x message from queued lines, with optional Content-Length; chunked encoding and partial messages are rejected. load_server_options reads fg_ticks/fg_seconds from #0.server_options, applying them as defaults to future runs; other native server options are unsupported.',
]}));
function obj(v:MooValue):bigint {if(v.type!=='object')fail('E_TYPE');return v.value;}
export function invokeServiceBuiltin(name:string,args:MooValue[],execution:Execution):MooValue {
 const {world,budget}=execution,original=world.environment??initialEnvironment(),size=JSON.stringify(original).length;budget.step(size);budget.allocate(size);const state=structuredClone(original),a=args[0]!,b=args[1],c=args[2];
 const commit=(result:MooValue=moo.int(0))=>{state.time++;world.setEnvironment(state,budget);return result;};
 if(['curl','exec','getenv','spellcheck','open_network_connection'].includes(name)){
  if(name==='exec'){if(!lst(a).length)fail('E_INVARG');lst(a).forEach(str);if(b)str(b);if(c)lst(c).forEach(str);}else str(a);
  if(name==='curl'&&c)int(c);
  if(name==='open_network_connection'){const port=int(b!);if(port<1n||port>65535n)fail('E_INVARG');if(c){if(c.type!=='map')fail('E_TYPE');if(c.value.length)fail('E_INVARG');}}
  const encoded=args.map(v=>encodeValue(v,{profile:world.profile})),key=JSON.stringify(encoded);budget.step(key.length);
  const fixture=state.fixtures?.find(f=>f.builtin===name&&JSON.stringify(f.args)===key);if(!fixture)fail('E_INVARG','No configured fixture for this request');
  const result=decodeValue(fixture.result,{profile:world.profile});budget.allocate(JSON.stringify(fixture.result).length);
  if(name==='exec')lst(result);
  if(name==='getenv'&&result.type!=='string'&&!(result.type==='int'&&result.value===0n))fail('E_INVARG','Invalid getenv fixture result');
  if(name==='spellcheck'&&result.type!=='int'&&result.type!=='list')fail('E_INVARG','Invalid spellcheck fixture result');
  if(name!=='open_network_connection')return result;
  const input=lst(result).map(str);state.connections??=[];let id=-2n;while(state.connections.some(c=>c.player===String(id))){budget.step();id--;}
  state.connections.push({...virtualConnection(String(id),state.time),name:'virtual:'+str(a)+':'+int(b!),input});return commit(moo.object(id));
 }
 if(name==='load_server_options'){
  const read=(object:bigint,name:string,fallback:MooValue):MooValue=>{try{return world.getProperty(object,name,budget);}catch(error){if(error instanceof MooError&&(error.code==='E_PROPNF'||error.code==='E_INVIND'))return fallback;throw error;}};
  const options=read(0n,'server_options',moo.object(-1));if(options.type!=='object')fail('E_TYPE');
  const ticks=int(read(options.value,'fg_ticks',moo.int(100000))),seconds=int(read(options.value,'fg_seconds',moo.int(30)));
  if(ticks<0n||seconds<0n||ticks>BigInt(Number.MAX_SAFE_INTEGER)||seconds>BigInt(Number.MAX_SAFE_INTEGER))fail('E_INVARG');state.serverOptions={fg_ticks:Number(ticks),fg_seconds:Number(seconds)};return commit();
 }
 if(name==='read_http'){
  const kind=fold(str(a));if(kind!=='request'&&kind!=='response')fail('E_INVARG');const id=b?obj(b):execution.current.player,connection=state.connections?.find(c=>c.player===String(id));if(!connection)fail('E_INVARG');
  const input=connection.input.join('\r\n');budget.step(input.length);budget.allocate(input.length);const end=input.indexOf('\r\n\r\n');if(end<0)fail('E_INVARG','Incomplete HTTP headers');
  const lines=input.slice(0,end).split('\r\n'),start=lines.shift()!,headers:[MooValue,MooValue][]=[],names=new Set<string>();let contentLength:number|undefined;
  for(const line of lines){const at=line.indexOf(':');if(at<1)fail('E_INVARG');const key=fold(line.slice(0,at)),value=line.slice(at+1).trim();if(names.has(key)||key==='transfer-encoding')fail('E_INVARG');names.add(key);headers.push([moo.string(key),moo.string(value)]);if(key==='content-length'){if(!/^\d+$/.test(value))fail('E_INVARG');contentLength=Number(value);}}
  const body=input.slice(end+4);if(contentLength!==undefined&&body.length!==contentLength)fail('E_INVARG','HTTP body must match Content-Length');
  const result:[MooValue,MooValue][]=[];
  if(kind==='request'){const match=/^([A-Z]+) (\S+) HTTP\/1\.[01]$/.exec(start);if(!match)fail('E_INVARG');result.push([moo.string('method'),moo.string(match[1]!)],[moo.string('uri'),moo.string(match[2]!)]);}
  else{const match=/^HTTP\/1\.[01] ([1-5][0-9]{2})(?: .*)?$/.exec(start);if(!match)fail('E_INVARG');result.push([moo.string('status'),moo.int(Number(match[1]))]);}
  if(headers.length)result.push([moo.string('headers'),moo.map(headers)]);if(body)result.push([moo.string('body'),moo.string(body)]);connection.input=[];connection.lastActive=state.time;return commit(moo.map(result));
 }
 state.listeners??=[];
 if(name==='listeners'){
  const listeners=state.listeners.filter(l=>!a||equal(a,a.type==='object'?moo.object(BigInt(l.object)):moo.int(l.port),budget));budget.allocate(listeners.length*12);
  return moo.list(listeners.map(l=>world.profile==='lambdamoo'?moo.list([moo.object(BigInt(l.object)),moo.int(l.port),moo.int(l.print?1:0)]):moo.map([['object',moo.object(BigInt(l.object))],['port',moo.int(l.port)],['print-messages',moo.int(l.print?1:0)],['ipv6',moo.int(0)],['interface',moo.string('virtual')]].map(([k,v])=>[moo.string(k as string),v as MooValue]))));
 }
 if(name==='listen'){
  const id=obj(a);world.get(id);const port=Number(int(b!));if(port<1||port>65535||state.listeners.some(l=>l.port===port))fail('E_INVARG');let print=false;
  if(c){if(world.profile==='lambdamoo')print=truth(c);else{if(c.type!=='map')fail('E_TYPE');for(const [key,value] of c.value){if(key.type!=='string'||fold(key.value)!=='print-messages')fail('E_INVARG');print=truth(value);}}}
  state.listeners.push({object:String(id),port,print});return commit(moo.int(port));
 }
 if(b&&truth(b))fail('E_INVARG','IPv6 simulation is unsupported');const port=Number(int(a));if(!state.listeners.some(l=>l.port===port))fail('E_INVARG');state.listeners=state.listeners.filter(l=>l.port!==port);return commit();
}
