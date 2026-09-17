import {serviceCases, serviceAvailable} from './helpers/service-cases.mjs';
import {sqliteCases, sqliteAvailable} from './helpers/sqlite-cases.mjs';
import {connectionCases, connectionAvailable} from './helpers/connection-cases.mjs';
import {fileCases, fileAvailable} from './helpers/file-cases.mjs';
import {cryptoCases, cryptoAvailable} from './helpers/crypto-cases.mjs';
import {regexCases, regexAvailable} from './helpers/regex-cases.mjs';
import {executionCases, executionAvailable} from './helpers/execution-cases.mjs';
import {codecCases, codecAvailable} from './helpers/codec-cases.mjs';
import {utilityCases, utilityAvailable} from './helpers/utility-cases.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,moo} from '../dist/index.js';
import {createTestWorld} from './helpers/world.mjs';
const context={this:moo.object(42),player:moo.object(7),caller:moo.object(7)};
const list=(...items)=>moo.list(items), strings=(...items)=>moo.list(items.map(moo.string));
const I=moo.int,S=moo.string,O=moo.object;
// Independent examples: expected values are authored here, not calculated from
// catalog metadata or by executing the implementation under test.
const cases={
  ...utilityCases, ...codecCases,...executionCases,...regexCases,...cryptoCases,...fileCases,...connectionCases,...sqliteCases,...serviceCases,
  add_property:['add_property(this,"score",10,{player,"rw"})',I(0),w=>assert.deepEqual(w.getProperty(42n,'score'),I(10))],
  add_verb:['add_verb(this,{player,"rx","new"},{"none","none","none"})',I(0),w=>assert.equal(w.ownVerb(42n,'new').verb.source,'')],
  children:['children(#1)',list(O(42))],
  clear_property:['clear_property(this,"root_value")',I(0),w=>{assert.equal(w.property(42n,'root_value').value,null);assert.deepEqual(w.getProperty(42n,'root_value'),I(1));}],
  create:['create(#1)',O(43),w=>{assert.equal(w.get(43n).parent,1n);assert.equal(w.get(43n).owner,7n);assert.equal(w.nextId,44n);}],
  delete_property:['delete_property(this,"lamp_on")',I(0),w=>assert.equal(w.get(42n).properties.some(p=>p.name==='lamp_on'),false)],
  delete_verb:['delete_verb(this,"calc")',I(0),w=>assert.equal(w.get(42n).verbs.length,0)],
  equal:['equal("A","a")',I(0)],
  function_info:['function_info("notify")',list(S('notify'),I(2),I(2),list(I(1),I(2)))],
  index:['index("aBaBa","ba")',I(2)],
  is_clear_property:['is_clear_property(this,"root_value")',I(1)],
  length:['length({4,5,6})',I(3)],
  max_object:['max_object()',O(42)],
  notify:['notify(player,"hello")',I(1)],
  object_bytes:['object_bytes(this)',I(0)],
  parent:['parent(this)',O(1)],
  pass:['this:calc(3)',I(8),undefined,w=>{
    w.addVerb(1n,{names:'calc',owner:7n,perms:'rx',args:['none','none','none'],source:'return args[1] + 1;'});
    w.setVerb(42n,'calc',{source:'return pass(@args) * 2;'});
  }],
  properties:['properties(this)',strings('lamp_on')],
  property_info:['property_info(this,"lamp_on")',list(O(7),S('rw'))],
  raise:['raise(E_TYPE,"bad",9)',undefined],
  recycle:['recycle(this)',I(0),w=>{assert.equal(w.valid(42n),false);assert.equal(w.nextId,43n);}],
  rindex:['rindex("aBaBa","ba")',I(4)],
  set_property_info:['set_property_info(this,"lamp_on",{#0,"r","light"})',I(0),w=>{const p=w.property(42n,'light');assert.equal(p.owner,0n);assert.equal(p.perms,'r');assert.deepEqual(p.value,I(0));assert.equal(w.get(42n).properties.some(p=>p.name==='lamp_on'),false);}],
  set_verb_args:['set_verb_args(this,"calc",{"any","with","any"})',I(0),w=>assert.deepEqual(w.ownVerb(42n,'calc').verb.args,['any','with','any'])],
  set_verb_code:['set_verb_code(this,"calc",{"return args[1] * 2;"})',list(),(w,r)=>assert.deepEqual(r.run('return #42:calc(5);',{world:w}).value,I(10))],
  set_verb_info:['set_verb_info(this,"calc",{#0,"r","sum add"})',I(0),w=>{const v=w.ownVerb(42n,'sum').verb;assert.equal(v.owner,0n);assert.equal(v.perms,'r');assert.equal(v.names,'sum add');}],
  toliteral:['toliteral({1,"a",#7})',S('{1, "a", #7}')],
  tostr:['tostr("x",1,#7)',S('x1#7')],
  typeof:['typeof({1})',I(4)],
  valid:['valid(#999)',I(0)],
  value_bytes:['value_bytes({1,"text",#999})',I(0)],
  verb_args:['verb_args(this,"calc")',strings('none','none','none')],
  verb_code:['verb_code(this,"calc")',strings('return args[1] + 1;')],
  verb_info:['verb_info(this,"calc")',list(O(7),S('rx'),S('calc'))],
  verbs:['verbs(this)',strings('calc')],
  mapdelete:['mapdelete(["a"->1,"b"->2],"a")',moo.map([[S('b'),I(2)]])],
  maphaskey:['maphaskey(["A"->1],"a")',I(1)],
  mapkeys:['mapkeys(["b"->2,"a"->1])',strings('a','b')],
  mapvalues:['mapvalues(["b"->2,"a"->1])',list(I(1),I(2))],
};
for(const profile of ['lambdamoo','toaststunt']) test(`${profile}: each builtin has an exact result and observable effect`,async t=>{
  const runtime=await createRuntime({profile});
  try {
    const names=Object.keys(cases).filter(name=>serviceAvailable(name,profile)&&sqliteAvailable(name,profile)&&connectionAvailable(name,profile)&&fileAvailable(name,profile)&&cryptoAvailable(name,profile)&&regexAvailable(name,profile)&&executionAvailable(name,profile)&&codecAvailable(name,profile)&&utilityAvailable(name,profile)&&(profile==='toaststunt'||!['mapdelete','maphaskey','mapkeys','mapvalues'].includes(name)));
    assert.deepEqual(runtime.listBuiltins().map(b=>b.name).sort(),names.sort());
    for(const name of names) await t.test(name,async()=>{
      const [expression,expected,verify,setup]=cases[name],world=createTestWorld({profile});
      world.addVerb(42n,{names:'calc',owner:7n,perms:'rx',args:['none','none','none'],source:'return args[1] + 1;'});
      if(name==='clear_property')world.setProperty(42n,'root_value',I(99));
      setup?.(world);
      const before=runtime.saveWorld(world);
      const result=await runtime[name==='suspend'?'runAsync':'run']('return '+expression+';',{world,context});
      if(name==='raise') {assert.equal(result.status,'runtime-error');assert.equal(result.diagnostics[0].code,'E_TYPE');assert.equal(result.diagnostics[0].message,'bad');}
      else {assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));assert.deepEqual(result.value,typeof expected==='function'?expected(profile):expected);}
      assert.deepEqual(result.output.map(e=>[e.recipient,e.text]),name==='notify'?[[O(7),'hello']]:[]);
      if(verify)verify(world,runtime);else {assert.equal(runtime.saveWorld(world),before);assert.deepEqual(result.changes,[]);}
    });
  }finally{runtime.dispose();}
});
