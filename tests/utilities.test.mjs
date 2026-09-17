import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,createWorkerSession,moo} from '../dist/index.js';
import {nodeWorkerFactory} from '../dist/worker/node-client.js';
import {createTestWorld} from './helpers/world.mjs';
const I=moo.int,F=moo.float,S=moo.string,L=(...v)=>moo.list(v);
for(const profile of ['lambdamoo','toaststunt'])test(`${profile}: utility boundaries and immutability`,async t=>{
 const r=await createRuntime({profile});
 const examples=[
 ['toint("bad")',I(0)],['toint(E_TYPE)',I(1)],['toint(#42)',I(42)],['toint(-1.9)',I(-1)],['toint(7)',I(7)],['toint(" 12 ")',I(12)],['toobj("bad")',moo.object(0)],
 ['tofloat("bad")',profile==='lambdamoo'?F(0):'E_INVARG'],['tofloat("1e999")','E_INVARG'],['tofloat(" -1.5 ")',F(-1.5)],['tofloat(#42)',F(42)],['tofloat(E_TYPE)',F(1)],['tofloat(2.5)',F(2.5)],
 ['tofloat({})','E_TYPE'],['toint({})','E_TYPE'],['toint("1e999")','E_FLOAT'],['min(1,2.0)','E_TYPE'],['min({})','E_TYPE'],['max(1.0,2.0)',F(2)],['abs(-1.5)',F(1.5)],['abs(1)',I(1)],['abs({})','E_TYPE'],
 ['sqrt(-1.0)','E_INVARG'],['sqrt(4)','E_TYPE'],['atan(0.0,1.0)',F(0)],['floatstr(1.5,2,1)',S('1.50e+00')],['floatstr(1.5,-1)','E_INVARG'],
 ['listappend({1,2},3,-5)',L(I(3),I(1),I(2))],['listinsert({1,2},3,99)',L(I(1),I(2),I(3))],['listinsert({1,2},3,2)',L(I(1),I(3),I(2))],['listappend({},3,0)',L(I(3))],
 ['listdelete({1},0)','E_RANGE'],['listdelete({1},2)','E_RANGE'],['listset({1},2,2)','E_RANGE'],['listappend({},1,"2")','E_TYPE'],['setadd(1,2)','E_TYPE'],
 ['setadd({"A"},"a")',L(S('A'))],['setremove({1},2)',L(I(1))],['is_member(1,{})',I(0)],['is_member(1,1)','E_INVARG'],
 ['strcmp("a","a")',I(0)],['strcmp("b","a")',I(1)],['strcmp(1,"a")','E_TYPE'],['strsub("abAB","ab","x",1)',S('xAB')],['strsub("ab","x","y")',S('ab')],['strsub("","x","y")',S('')],['strsub("a","","b")','E_INVARG'],
 ...(profile==='toaststunt'?[
 ['is_member("A",["key"->"a"],0)',I(1)],['is_member(1,{},"x")','E_TYPE'],['explode("a,,b,",",",1)',L(S('a'),S(''),S('b'),S(''))],['explode("a b","")',L(S('a'),S('b'))],
 ['reverse({1,2})',L(I(2),I(1))],['reverse(1)','E_INVARG'],['slice({{1,2},{3,4}})',L(I(1),I(3))],['slice({"ab","cd"},{2,1})',L(L(S('b'),S('a')),L(S('d'),S('c')))],
 ['slice({["a"->1],[]},"a")',L(I(1))],['slice({["a"->1],[]},"a",9)',L(I(1),I(9))],['slice({}, {})','E_RANGE'],['slice({}, {0})','E_RANGE'],['slice({}, {"a"})','E_INVARG'],['slice({}, E_TYPE)','E_INVARG'],['slice({},0)','E_RANGE'],['slice({1},1)','E_INVARG'],['slice({{1}},"a")','E_INVARG'],
 ['sort({"a","b"},{2,1})',L(S('b'),S('a'))],['sort({1,2},{},0,1)',L(I(2),I(1))],['sort({})',L()],['sort({1},{1,2})','E_INVARG'],['sort({1,2.0})','E_TYPE'],['sort({1},{},1)',L(I(1))],['sort({"a10","a2","a1"},{},1)',L(S('a1'),S('a2'),S('a10'))],['sort({"a02","a01"},{},1)',L(S('a01'),S('a02'))],
 ['distance({1},{1,2})','E_INVARG'],['relative_heading({1.0},{2.0})','E_INVARG'],['relative_heading({0.0,0.0,0.0},{0.0,-1.0,0.0})',L(I(270),I(0))]
 ]:[])
 ];
 try {
  for(const [source,expected] of examples)await t.test(source,()=>{
   const result=r.run(`return ${source};`);
   if(typeof expected==='string'){assert.equal(result.status,'runtime-error');assert.equal(result.diagnostics[0].code,expected);}
   else{assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));assert.deepEqual(result.value,expected);}
  });
  const copy=r.run('a={1,2}; b=listappend(a,3); c=listset(a,9,1); return {a,b,c};');
  assert.deepEqual(copy.value,L(L(I(1),I(2)),L(I(1),I(2),I(3)),L(I(9),I(2))));
  assert.equal(r.run('return strsub("aaaa","a","0123456789");',{limits:{allocations:30}}).status,'limit-exceeded');
  const world=createTestWorld({profile}),session=createWorkerSession({runtime:r,world,workerFactory:nodeWorkerFactory()});
  const source='return {toint("42"), sqrt(4.0), listappend({1},2), strsub("A","a","b")};';
  assert.deepEqual((await session.run(source).result).value,r.run(source).value);
 }finally{r.dispose();}
});
