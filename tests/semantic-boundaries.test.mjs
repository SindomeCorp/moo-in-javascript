import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntime,moo} from '../dist/index.js';
// docs/semantics.md: portable two's-complement wrapping policy, and the pinned
// ToastStunt divisor-sign remainder. Expected numbers are independent literals.
for(const profile of ['lambdamoo','toaststunt']) test(`${profile}: arithmetic and control-flow boundaries`,async t=>{
  const runtime=await createRuntime({profile});
  const [min,max,half]=profile==='lambdamoo'?[-2147483648n,2147483647n,1073741824n]:[-9223372036854775808n,9223372036854775807n,4611686018427387904n];
  const cases=[
    ['float addition','return 1.25 + 2.5;',moo.float(3.75)],
    ['float subtraction','return 1.25 - 2.5;',moo.float(-1.25)],
    ['float sum overflow','return 1e308 + 1e308;','E_FLOAT'],
    ['float difference overflow','return -1e308 - 1e308;','E_FLOAT'],
    ['integer maximum plus one',`return ${max} + 1;`,moo.int(min)],
    ['integer minimum minus one',`return ${min} - 1;`,moo.int(max)],
    ['integer multiply overflow',`return ${half} * 2;`,moo.int(min)],
    ['integer division overflow',`return ${min} / -1;`,moo.int(min)],
    ['integer negation overflow',`return -(${min});`,moo.int(min)],
    ['integer maximum remains exact',`return ${max} / 1;`,moo.int(max)],
    ['integer modulo zero','return 3 % 0;','E_DIV'],
    ['float modulo negative zero','return 3.0 % -0.0;','E_DIV'],
    ['positive/negative remainder','return 5 % -3;',moo.int(profile==='lambdamoo'?2:-1)],
    ['negative/positive remainder','return -5 % 3;',moo.int(profile==='lambdamoo'?-2:1)],
    ['negative/negative remainder','return -5 % -3;',moo.int(-2)],
    ['positive/positive remainder','return 5 % 3;',moo.int(2)],
    ['float positive/negative remainder','return 5.0 % -3.0;',moo.float(profile==='lambdamoo'?2:-1)],
    ['float negative/negative remainder','return -5.0 % -3.0;',moo.float(-2)],
    ['unselected branches do not mutate','x=0; if(0) x=1; elseif(1) x=2; else x=3; endif 0 && (x=4); 1 || (x=5); y=1 ? x | (x=6); return {x,y};',moo.list([moo.int(2),moo.int(2)])],
    ['named break exits outer loop','n=0; for i in {1,2} for j in {3,4} n=n+1; break i; endfor n=99; endfor return n;',moo.int(1)],
    ['named continue runs finally','n=0; for i in {1,2} for j in {3,4} try continue i; finally n=n+1; endtry endfor n=99; endfor return n;',moo.int(2)],
    ['finally preserves return','x=0; try return 8; finally x=3; endtry',moo.int(8)],
    ['finally break overrides return','for i in {1} try return 8; finally break; endtry endfor return 9;',moo.int(9)],
    ['finally return overrides break','for i in {1} try break; finally return 7; endtry endfor return 9;',moo.int(7)],
    ['finally error overrides return','try return 8; finally raise(E_TYPE); endtry','E_TYPE'],
    ['finally preserves error','try raise(E_DIV); finally x=3; endtry','E_DIV'],
  ];
  try {
    for(const [name,source,expected] of cases)await t.test(name,()=>{
      const result=runtime.run(source);
      if(typeof expected==='string'){assert.equal(result.status,'runtime-error',source);assert.equal(result.diagnostics[0].code,expected);}
      else {assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));assert.deepEqual(result.value,expected,source);}
    });
  }finally{runtime.dispose();}
});
