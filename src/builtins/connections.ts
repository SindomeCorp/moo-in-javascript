import type { Utility } from './utilities.js';
import { str,int,text } from './utilities.js';
import { moo,type MooValue } from '../values/index.js';
import { truth,fold } from '../values/operations.js';
import { fail } from '../runtime/errors.js';
import type { Execution } from '../runtime/execution.js';
import { initialEnvironment,virtualConnection } from '../host/environment.js';
import { World } from '../world/index.js';
import { saveWorld } from '../snapshots/codec.js';
const p=(name:string,type:Utility['returns'],optional=false)=>({name,types:[type],optional,description:name+'.'});
const connection=()=>p('connection','object');
const specs:[string,Utility['parameters'],Utility['returns'],('toaststunt'|'lambdamoo')?][]=[

 ['connected_players',[p('includeUnlogged','any',true)],'list'],
 ['connected_seconds',[connection()],'int'],['idle_seconds',[connection()],'int'],['connection_name',[connection(),p('numeric','int',true)],'string'],
 ['connection_option',[connection(),p('option','string')],'any','lambdamoo'],
 ['connection_options',[connection(),p('option','string',true)],'any'],
 ['set_connection_option',[connection(),p('option','string'),p('value','any')],'int'],
 ['connection_info',[connection()],'map','toaststunt'],['connection_name_lookup',[connection(),p('reset','any',true)],'string','toaststunt'],
 ['boot_player',[connection()],'int'],['buffered_output_length',[p('connection','object',true)],'int'],['output_delimiters',[connection()],'list'],
 ['force_input',[connection(),p('line','string'),p('atFront','any',true)],'int'],['flush_input',[connection(),p('showMessages','any',true)],'int'],
 ['switch_player',[connection(),p('newPlayer','object'),p('silent','int',true)],'int','toaststunt'],['read',[p('connection','object',true),p('nonBlocking','any',true)],'any'],
 ['server_version',[p('details','any',true)],'string'],['server_log',[p('message','string'),p('important','any',true)],'int'],['shutdown',[p('message','string',true),p('restart','any',true)],'int'],
 ['dump_database',[],'int'],['db_disk_size',[],'int'],
];
export const connectionBuiltins:Omit<Utility,'invoke'>[]=specs.map(([name,parameters,returns,profile])=>({name,parameters,returns,...(profile?{profiles:[profile]}:{}),summary:'Simulated host: '+name.replaceAll('_',' ')+'.',notes:[
 'Uses persistent virtual connections only. Configure them with createHostEnvironment(), or force_input() creates a connection for a valid object. No real network or operating-system operations and no wizard checks.',
 'Connection age/idle time use the virtual host operation counter. Supported options: binary, hold-input, client-echo, disable-oob. Options and delimiters are metadata; no telnet or command parser runs. flush_input discards queued lines without messages. read() consumes preloaded input; empty blocking reads raise E_INVARG, nonblocking reads return 0.',
 'server_log records messages; shutdown records a request without stopping JavaScript. dump_database saves a virtual checkpoint inside the world; db_disk_size measures its UTF-8 bytes (0 before a dump). server_version identifies this interpreter, not a native MOO release. Detailed version/restart flags are rejected.',
]}));
function obj(v:MooValue):bigint {if(v.type!=='object')fail('E_TYPE');return v.value;}
export function invokeConnectionBuiltin(name:string,args:MooValue[],execution:Execution):MooValue {
 const {world,budget}=execution,original=world.environment??initialEnvironment();const length=JSON.stringify(original).length;budget.step(length);budget.allocate(length);const state=structuredClone(original);state.connections??=[];
 const a=args[0],b=args[1],c=args[2];
 const commit=(value:MooValue=moo.int(0))=>{state.time++;world.setEnvironment(state,budget);return value;};
 if(name==='connected_players'){const connections=state.connections.filter(c=>BigInt(c.player)>=0n||a&&truth(a));budget.allocate(connections.length);return moo.list(connections.map(c=>moo.object(BigInt(c.player))));}
 if(name==='server_version'){if(a&&truth(a))fail('E_INVARG');return text('moo-in-javascript/0.2.0 (educational)',budget);}
 if(name==='server_log'){const message=str(a!);state.logs??=[];state.logs.push(message);return commit();}
 if(name==='shutdown'){if(b&&truth(b))fail('E_INVARG','Native process restart is not supported');state.shutdown=a?str(a):'Shutdown requested';return commit();}
 if(name==='dump_database'){
  const environment=structuredClone(state);delete environment.checkpoint;const copy=new World({profile:world.profile,limits:world.limits});copy.restore(world.objects(),world.nextId,environment);state.checkpoint=saveWorld(copy);return commit();
 }
 if(name==='db_disk_size'){const checkpoint=state.checkpoint??'';budget.allocate(checkpoint.length*3);return moo.int(new TextEncoder().encode(checkpoint).length);}
 if(name==='buffered_output_length'&&!a){const size=state.connections.reduce((sum,c)=>sum+c.output.reduce((n,s)=>n+s.length,0),0);return moo.int(size);}
 const id=a?obj(a):execution.current.player;
 let conn=state.connections.find(c=>c.player===String(id));
 if(name==='force_input'&&!conn){world.get(id);conn=virtualConnection(String(id),state.time);state.connections.push(conn);}
 if(!conn&&name==='boot_player')return moo.int(0);
 if(!conn)fail('E_INVARG','No virtual connection for this object');
 switch(name){
  case 'connected_seconds':return moo.int(Math.max(0,state.time-conn.connectedAt));
  case 'idle_seconds':return moo.int(Math.max(0,state.time-conn.lastActive));
  case 'connection_name':if(b)int(b);return text(conn.name,budget);
  case 'connection_name_lookup':return text(conn.name,budget);
  case 'connection_info':budget.allocate(16);return moo.map([
   ['source_address',moo.string(conn.name)],['source_ip',moo.string('virtual')],['source_port',moo.int(0)],['destination_address',moo.string('educational-host')],['destination_ip',moo.string('virtual')],['destination_port',moo.int(0)],['protocol',moo.string('virtual')],['outbound',moo.int(id<0n?1:0)]
  ].map(([key,value])=>[moo.string(key as string),value as MooValue]));
  case 'connection_option':case 'connection_options':{
   if(b){const key=fold(str(b));if(!Object.hasOwn(conn.options,key))fail('E_INVARG');return moo.int(conn.options[key]?1:0);}
   budget.allocate(Object.keys(conn.options).length*3);return moo.list(Object.entries(conn.options).map(([key,value])=>moo.list([moo.string(key),moo.int(value?1:0)])));
  }
  case 'set_connection_option':{const key=fold(str(b!));if(!Object.hasOwn(conn.options,key))fail('E_INVARG');conn.options[key]=truth(c!);return commit();}
  case 'boot_player':state.connections=state.connections.filter(c=>c!==conn);return commit();
  case 'buffered_output_length':return moo.int(conn.output.reduce((sum,s)=>sum+s.length,0));
  case 'output_delimiters':budget.allocate(2);return moo.list([moo.string(conn.prefix),moo.string(conn.suffix)]);
  case 'force_input':if(c&&truth(c))conn.input.unshift(str(b!));else conn.input.push(str(b!));return commit();
  case 'flush_input':conn.input=[];return commit();
  case 'switch_player':{const target=obj(b!);world.get(target);if(c)int(c);if(state.connections.some(c=>c!==conn&&c.player===String(target)))fail('E_INVARG');conn.player=String(target);return commit();}
  case 'read':{const line=conn.input.shift();if(line===undefined){if(b&&truth(b))return moo.int(0);return fail('E_INVARG','No queued input; blocking reads require a scheduler');}conn.lastActive=state.time;return commit(text(line,budget));}
 }
 return fail('E_INVARG');
}
