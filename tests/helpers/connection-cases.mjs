import assert from 'node:assert/strict';
import {moo,createHostEnvironment} from '../../dist/index.js';
const I=moo.int,S=moo.string,O=moo.object,L=(...v)=>moo.list(v);
const setup=w=>w.setEnvironment(createHostEnvironment({connections:[{player:7,input:['hello']}]}));
const changed=w=>assert.ok(w.environment.time>0);
export const connectionCases={
 connected_players:['connected_players()',L(O(7))],connected_seconds:['connected_seconds(#7)',I(0)],idle_seconds:['idle_seconds(#7)',I(0)],connection_name:['connection_name(#7)',S('virtual:7')],connection_name_lookup:['connection_name_lookup(#7)',S('virtual:7')],
 connection_option:['connection_option(#7,"client-echo")',I(1)],connection_options:['connection_options(#7)',L(L(S('binary'),I(0)),L(S('hold-input'),I(0)),L(S('client-echo'),I(1)),L(S('disable-oob'),I(0)))],set_connection_option:['set_connection_option(#7,"binary",1)',I(0),changed],
 connection_info:['connection_info(#7)',moo.map([['source_address',S('virtual:7')],['source_ip',S('virtual')],['source_port',I(0)],['destination_address',S('educational-host')],['destination_ip',S('virtual')],['destination_port',I(0)],['protocol',S('virtual')],['outbound',I(0)]].map(([k,v])=>[S(k),v]))],
 boot_player:['boot_player(#7)',I(0),changed],buffered_output_length:['buffered_output_length(#7)',I(0)],output_delimiters:['output_delimiters(#7)',L(S(''),S(''))],force_input:['force_input(#7,"new")',I(0),changed],flush_input:['flush_input(#7)',I(0),changed],switch_player:['switch_player(#7,#42)',I(0),changed],read:['read(#7)',S('hello'),changed],
 server_version:['server_version()',S('moo-in-javascript/0.2.0 (educational)')],server_log:['server_log("hello")',I(0),changed],shutdown:['shutdown("bye")',I(0),changed],dump_database:['dump_database()',I(0),changed],db_disk_size:['db_disk_size()',I(0)],
};
for(const testcase of Object.values(connectionCases))testcase[3]=setup;
export const connectionAvailable=(name,profile)=>name==='connection_option'?profile==='lambdamoo':profile==='toaststunt'||!['connection_info','connection_name_lookup','switch_player'].includes(name);
