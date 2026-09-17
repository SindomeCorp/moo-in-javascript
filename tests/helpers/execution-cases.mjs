import {moo} from '../../dist/index.js';
const I=moo.int,S=moo.string,O=moo.object,L=(...v)=>moo.list(v);
export const executionCases={
 suspend:['suspend(0)',I(0)],
 recreate:['recreate(#2,#1)',O(2),w=>{if(w.get(2n).parent!==1n)throw Error('Wrong recreated parent');}],
 renumber:['renumber(#42)',O(2),w=>{if(w.valid(42n)||!w.valid(2n))throw Error('Object was not renumbered');}],
 reset_max_object:['reset_max_object()',I(0)],
 occupants:['occupants({#7,#42},#1)',L(O(42))],locations:['locations(#42)',L()],recycled_objects:['length(recycled_objects())',I(39)],next_recycled_object:['next_recycled_object()',O(2)],
 players:['players()',L()],is_player:['is_player(#7)',I(0)],
 set_player_flag:['set_player_flag(#7,1)',I(0),w=>{if(!w.get(7n).player)throw Error('Player flag was not set');}],
 chparent:['chparent(#42,#0)',I(0),w=>{if(w.get(42n).parent!==0n)throw Error('Parent was not changed');}],
 move:['move(#42,#-1)',I(0)],set_task_perms:['set_task_perms(player)',I(0)],
 call_function:['call_function("length",{1,2})',I(2)],eval:['eval("return 6 * 7;")',L(I(1),I(42))],callers:['callers()',L()],ticks_left:['ticks_left() > 0',I(1)],task_id:['task_id() == task_id()',I(1)],task_perms:['task_perms()',O(7)],caller_perms:['caller_perms()',O(-1)],
 task_local:['task_local()',I(0)],set_task_local:['set_task_local({1,2})',I(0)],parents:['parents(#42)',L(O(1))],ancestors:['ancestors(#42)',L(O(1),O(0))],descendants:['descendants(#1)',L(O(42))],isa:['isa(#42,#0)',I(1)],owned_objects:['owned_objects(#7)',L(O(7),O(42))],locate_by_name:['locate_by_name("CEIV")',L(O(42))],respond_to:['respond_to(#7,"tell")',L(O(7),S('tell'))],
};
const toast=new Set(['recreate','occupants','locations','recycled_objects','next_recycled_object','task_local','set_task_local','parents','ancestors','descendants','isa','owned_objects','locate_by_name','respond_to']);
export const executionAvailable=(name,profile)=>profile==='toaststunt'||!toast.has(name);
