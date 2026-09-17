import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorkerSession,moo} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';
const I=moo.int,F=moo.float,S=moo.string,O=moo.object,L=(...v)=>moo.list(v),M=(...v)=>moo.map(v);
const context={this:O(42),player:O(7),caller:O(7)};
for(const profile of ['lambdamoo','toaststunt'])test(`${profile}: encoding, dynamic calls and regex boundaries`,async t=>{
 const r=await createRuntime({profile});
 const examples=[
 ['encode_binary()',S('')],['encode_binary(256)','E_INVARG'],['encode_binary(-1)','E_INVARG'],['encode_binary(#1)','E_INVARG'],['decode_binary("~")','E_INVARG'],['decode_binary("~XX")','E_INVARG'],['decode_binary("a~09~0A~FF~00~7E",1)',L(I(97),I(9),I(10),I(255),I(0),I(126))],['decode_binary("~00a~09b")',L(I(0),S('a\tb'))],
 ['call_function("LENGTH","abc")',I(3)],['call_function("missing")','E_INVARG'],['call_function("length")','E_ARGS'],['call_function(1)','E_TYPE'],['call_function("pass")','E_VERBNF'],['eval("return 1;",1)','E_TYPE'],['eval("return ;")[2]',I(0)],['eval("return +;")[1]',I(0)],['eval("return {this,caller,player,args,verb};")[2]',L(O(-1),O(42),O(7),L(),S(''))],['eval("return unknown;")','E_VARNF'],['caller_perms()',O(-1)],
 ['match("a","z")',L()],['match("A","a",1)',L()],['substitute("%%:%0:%1",match("Ab","%(A%)b"))',S('%:Ab:A')],['substitute("%",match("a","a"))','E_INVARG'],['substitute("%x",match("a","a"))','E_INVARG'],['substitute("x",{})','E_INVARG'],['substitute("x",{1,1,{},"x"})','E_INVARG'],['match("x","%")','E_INVARG'],['match("x","[")','E_INVARG'],['match("a","%(a%)%1")','E_INVARG'],['match("a","%(")','E_INVARG'],['match("(a)","(a)")[1]',I(1)],['match("a.b","a%.b")[2]',I(3)],['match("%","[%]")[1]',I(1)],['match(" ","%W")[1]',I(1)],['rmatch("x","$")[1]',I(2)],
 ...(profile==='toaststunt'?[
 ['chr(0,255)',S('\0ÿ')],['encode_base64("f")',S('Zg==')],['encode_base64("fo")',S('Zm8=')],['encode_base64("~FF~FF",1)',S('__8')],['decode_base64("__8",1)',S('~FF~FF')],['decode_base64("Zm8=")',S('fo')],['decode_base64("Zg==")',S('f')],['decode_base64("")',S('')],['decode_base64("Zg")','E_INVARG'],['decode_base64("A",1)','E_INVARG'],['decode_base64("=AAA")','E_INVARG'],['decode_base64("Zg=")','E_INVARG'],['decode_base64("A===")','E_INVARG'],['decode_base64("Zg== ")','E_INVARG'],
 ['url_encode("!()")',S('%21%28%29')],['url_decode("a+b")',S('a+b')],['url_decode("%FF")','E_INVARG'],['url_decode("%zz")','E_INVARG'],['strtr("aAbB","ab","x",1)',S('xAB')],['strtr("aAbB","ab","x")',S('xX')],['remove_ansi("[bogus][constructor][random][beep][null]")',S('[bogus][constructor]')],['parse_ansi("[beep][null][B:RED]")',S('\x07\x1b[41m')],['length(parse_ansi("[random]"))',I(5)],
 ['parse_json("false")',I(0)],['parse_json("1.0")',F(1)],['parse_json("9223372036854775808")',F(9223372036854775808)],['parse_json("1e999")','E_INVARG'],['parse_json("01")','E_INVARG'],['parse_json("[1,]")','E_INVARG'],['parse_json("[1")','E_INVARG'],['parse_json("{")','E_INVARG'],['parse_json("true false")','E_INVARG'],['parse_json("@")','E_INVARG'],['parse_json("[]","bad")','E_INVARG'],['parse_json("[]",1)','E_TYPE'],
 ['parse_json(generate_json([#7->{E_TYPE,1.5,"x|int"}],"embedded-types"),"embedded-types")',M([O(7),L(moo.error('E_TYPE'),F(1.5),S('x|int'))])],['parse_json("\\\"42|int\\\"","embedded-types")',I(42)],['parse_json("\\\"2.5|float\\\"","embedded-types")',F(2.5)],['parse_json("\\\"bad|err\\\"","embedded-types")',moo.error('E_NONE')],['parse_json("\\\"bad|obj\\\"","embedded-types")',O(0)],['parse_json("\\\"bad|float\\\"","embedded-types")','E_INVARG'],['generate_json(1,"common-subset",1)','E_INVARG'],['generate_json(1.0)',S('1.0')],['generate_json([])',S('{}')],['generate_json([1->#2])',S('{"1":"#2"}')],
 ['parents(#0)',L()],['ancestors(#42,1)',L(O(42),O(1),O(0))],['descendants(#1,1)',L(O(1),O(42))],['ancestors(#999)','E_INVARG'],['descendants(#999)','E_INVARG'],['isa(#42,{#7,#1},1)',O(1)],['isa(#999,#0)',I(0)],['isa(#42,#7,1)',O(-1)],['isa(#42,{1})','E_TYPE'],['isa(#42,#1,"x")','E_TYPE'],['owned_objects(#999)','E_INVIND'],['locate_by_name("CEIV",1)',L()],['locate_by_name("ceiv",1)',L(O(42))],['locate_by_name("x","x")','E_TYPE'],['respond_to(#42,"missing")',I(0)],['respond_to(#999,"x")','E_INVARG'],
 ['pcre_match("A1A2","a(?<digit>[0-9])")[2]["digit"]["match"]',S('2')],['pcre_match("A","a",1)',L()],['pcre_match("abc","")','E_INVARG'],['pcre_match("aaa","(?=a)")','E_INVARG'],['pcre_match("a","a{2}")','E_INVARG'],['pcre_match("a","a","x")','E_TYPE'],['pcre_match("a","a",0,"x")','E_TYPE'],['pcre_match("b","(a)?b")[1]["0"]["match"]',S('b')],['length(pcre_match("ab","x*"))',I(3)],
 ['pcre_replace("Aa","s/a/x/i")',S('xa')],['pcre_replace("Aa","s/a/x/g")',S('Ax')],['pcre_replace("abc","s/z/x/g")',S('abc')],['pcre_replace("a","s/a/$&/")',S('a')],['pcre_replace("a","s/a/$9/")','E_INVARG'],['pcre_replace("a","bad")','E_INVARG'],['pcre_replace("a","s/a/x/q")','E_INVARG'],['pcre_replace("a","s/a/x")','E_INVARG'],['pcre_replace("a","s#a#x#ms")',S('x')]
 ]:[])
 ];
 try{
 for(const [expression,expected]of examples)await t.test(expression,()=>{const result=r.run('return '+expression+';',{world:createTestWorld({profile}),context});if(typeof expected==='string'){assert.equal(result.status,'runtime-error',expression);assert.equal(result.diagnostics[0].code,expected);}else{assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));assert.deepEqual(result.value,expected);}});
 const world=createTestWorld({profile});world.addVerb(42n,{names:'probe',owner:7n,perms:'rx',args:['none','none','none'],source:'return {caller_perms(),callers(1)};'});
 const frame=r.run('return this:probe();',{world,context});assert.equal(frame.status,'completed');assert.deepEqual(frame.value.value[0],O(7));assert.equal(frame.value.value[1].value.length,1);
 assert.equal(r.run('return rmatch("abcdefghij",".*");',{limits:{steps:50}}).status,'limit-exceeded');
 if(profile==='toaststunt'){
  assert.deepEqual(r.run('set_task_local({1,2}); return eval("return task_local();");').value,L(I(1),L(I(1),I(2))));assert.deepEqual(r.run('return task_local();').value,I(0));
  assert.equal(r.run('return parse_json("[[[[[1]]]]]");',{limits:{evaluationDepth:4}}).status,'limit-exceeded');
  assert.equal(r.run('return generate_json({"abc","def"});',{limits:{allocations:20}}).status,'limit-exceeded');
 }
 const session=createWorkerSession({runtime:r,world,workerFactory:nodeWorkerFactory()});const source='return {eval("return 42;"),encode_binary(0,255),substitute("%0",match("hello","h.*"))};';
 try{assert.deepEqual((await session.run(source).result).value,r.run(source,{world}).value);}finally{}
 }finally{r.dispose();}
});
