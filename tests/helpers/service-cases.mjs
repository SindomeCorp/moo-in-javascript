import assert from 'node:assert/strict';
import {moo,createHostEnvironment} from '../../dist/index.js';
const I=moo.int,S=moo.string,L=(...v)=>moo.list(v);
const setup=w=>w.setEnvironment({...createHostEnvironment({connections:[{player:7,input:['GET / HTTP/1.1','','']}],fixtures:[{builtin:'curl',args:[S('example')],result:S('hello')},{builtin:'exec',args:[L(S('example'))],result:L(I(0),S('hello'),S(''))},{builtin:'getenv',args:[S('EXAMPLE')],result:S('value')},{builtin:'spellcheck',args:[S('hello')],result:I(1)},{builtin:'open_network_connection',args:[S('example'),I(80)],result:L(S('hello'))}]}),listeners:[{object:'7',port:8080,print:false}]});
const changed=w=>assert.equal(w.environment.time,1);
export const serviceCases={
 curl:['curl("example")',S('hello')],exec:['exec({"example"})',L(I(0),S('hello'),S(''))],getenv:['getenv("EXAMPLE")',S('value')],spellcheck:['spellcheck("hello")',I(1)],
 open_network_connection:['open_network_connection("example",80)',moo.object(-2),changed],listen:['listen(#7,8081)',I(8081),changed],unlisten:['unlisten(8080)',I(0),changed],listeners:['listeners()',profile=>L(profile==='lambdamoo'?L(moo.object(7),I(8080),I(0)):moo.map([['object',moo.object(7)],['port',I(8080)],['print-messages',I(0)],['ipv6',I(0)],['interface',S('virtual')]].map(([k,v])=>[S(k),v])))],
 read_http:['read_http("request",#7)',moo.map([[S('method'),S('GET')],[S('uri'),S('/')]]),changed],load_server_options:['load_server_options()',I(0),changed],
};
for(const testcase of Object.values(serviceCases))testcase[3]=setup;
export const serviceAvailable=(name,profile)=>profile==='toaststunt'||!['curl','exec','getenv','spellcheck','read_http','load_server_options'].includes(name);
