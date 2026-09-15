import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, moo, encodeValue, HostError } from '../dist/index.js';

// Reviewed expectations: LambdaMOO manual, arithmetic/comparison/sequence/flow
// sections; ToastStunt pinned numbers.cc, utils.cc, map.cc and collection.cc.
const shared = [
  ['return 5 + 2;', moo.int(7)], ['return 5 - 2;', moo.int(3)],
  ['return 5 * 2;', moo.int(10)], ['return -5 / 2;', moo.int(-2)],
  ['return 5.0 / 2.0;', moo.float(2.5)], ['return 3 ^ 4;', moo.int(81)],
  ['return 3.5 ^ 4;', moo.float(150.0625)], ['return 2 ^ -1;', moo.int(0)],
  ['return "foo" + "bar";', moo.string('foobar')],
  ['return {3 == 3.0, "foo" == "Foo", {1,"a"} == {1,"A"}, #7 == 7};', moo.list([moo.int(0), moo.int(1), moo.int(1), moo.int(0)])],
  ['return {3 < 4, 3 <= 3, 3 > 4, #34 >= #32, E_DIV > E_TYPE};', moo.list([moo.int(1), moo.int(1), moo.int(0), moo.int(1), moo.int(1)])],
  ['return {0 && raise(E_ARGS), 7 || raise(E_ARGS), 1 && 9, 0 || 8};', moo.list([moo.int(0), moo.int(7), moo.int(9), moo.int(8)])],
  ['return {!#7, !E_TYPE, !{}, !"", !-1, !0.0};', moo.list([moo.int(1), moo.int(1), moo.int(1), moo.int(1), moo.int(0), moo.int(1)])],
  ['return 0 ? raise(E_ARGS) | 7;', moo.int(7)],
  ['x = 1; X = x + 2; return x;', moo.int(3)],
  ['INT=8; return {int,INT,NuM};', moo.list([moo.int(8),moo.int(8),moo.int(0)])],
  ['return 13 + (x = 17);', moo.int(30)],
  ['"durable comment"; x = 5; x += 3; x -= 1; return x;', moo.int(7)],
  ['a={2,3}; return {1,@a,4};', moo.list([moo.int(1),moo.int(2),moo.int(3),moo.int(4)])],
  ['return {2 in {5,8,2,3}, "bar" in {"Foo","Bar"}, 7 in {1}};', moo.list([moo.int(3),moo.int(2),moo.int(0)])],
  ['return "frob"[{3,2,4}[$]];', moo.string('b')],
  ['return {"abc"[2..$], "abc"[17..12], {1,2,3}[..2], {1,2}[2..]};', moo.list([moo.string('bc'),moo.string(''),moo.list([moo.int(1),moo.int(2)]),moo.list([moo.int(2)])])],
  ['a={{1,2},"foo"}; b=a; a[1][2]=9; a[2][$]="z"; return {a,b};', moo.list([moo.list([moo.list([moo.int(1),moo.int(9)]),moo.string('foz')]),moo.list([moo.list([moo.int(1),moo.int(2)]),moo.string('foo')])])],
  ['s="foobar"; s[7..12]="baz"; return s;', moo.string('foobarbaz')],
  ['a={1,2}; a[2..1]={7,8}; return a;', moo.list([moo.int(1),moo.int(7),moo.int(8),moo.int(2)])],
  ['if (0) return 1; elseif (2) return 2; else return 3; endif', moo.int(2)],
  ['i=0; sum=0; while(i<5) i=i+1; if(i==2) continue; endif if(i==4) break; endif sum=sum+i; endwhile return sum;', moo.int(4)],
  ['sum=0; for i in [1..4] sum=sum+i; endfor return sum;', moo.int(10)],
  ['x=0; for i in {3,4} for j in {1,2} x=x+1; continue i; endfor endfor return x;', moo.int(2)],
  ['for i in {3,4} while(1) return i; endwhile endfor', moo.int(3)],
  ['return {typeof(1),typeof(1.0),typeof(#1),typeof("a"),typeof({}),typeof(E_TYPE)};', moo.list([moo.int(0),moo.int(9),moo.int(1),moo.int(2),moo.int(4),moo.int(3)])],
  ['return {equal("a","A"), length({1,2}), length("abc")};', moo.list([moo.int(0),moo.int(2),moo.int(3)])],
  ['return tostr("id=",#7,";",E_TYPE,";",{1});', moo.string('id=#7;Type mismatch;{list}')],
  ['return toliteral({1,1.0,#7,"a",E_TYPE});', moo.string('{1, 1.0, #7, "a", E_TYPE}')],
  ['return tostr(@{"a",2,"b"});', moo.string('a2b')],
  ['return {toliteral(1e-5),toliteral(1e15),toliteral(-0.0)};', moo.list([moo.string('1e-05'),moo.string('1e+15'),moo.string('-0.0')])],
  ['return;', moo.int(0)], ['x=1;', moo.int(0)],
];

for (const profile of ['lambdamoo','toaststunt']) {
  test(`${profile}: reviewed expression, sequence and flow results`, async () => {
    const runtime = await createRuntime({ profile });
    try {
      for (const [source, expected] of shared) {
        const result = runtime.run(source);
        assert.equal(result.status, 'completed', `${source}: ${JSON.stringify(result.diagnostics)}`);
        assert.deepEqual(encodeValue(result.value, { profile }), encodeValue(expected, { profile }), source);
      }
    } finally { runtime.dispose(); }
  });
  test(`${profile}: runtime failures are typed and located`, async () => {
    const runtime = await createRuntime({ profile });
    try {
      for (const [source, code] of [
        ['return 1 + 2.0;','E_TYPE'], ['return 1 / 0;','E_DIV'], ['return 1.0 / 0.0;','E_DIV'],
        ['return 1 < 1.0;','E_TYPE'], ['return 1 ^ 2.0;','E_TYPE'], ['return 0 ^ -1;','E_DIV'],
        ['return missing;','E_VARNF'], ['return {1}[0];','E_RANGE'], ['return ""[1];','E_RANGE'],
        ['return {1}["x"];','E_TYPE'], ['return "abc"[0..2];','E_RANGE'], ['return {@1};','E_TYPE'],
        ['s="abc"; s[2]="zz";','E_INVARG'], ['a={1}; a[1..1]=4;','E_TYPE'],
        ['return length(1);','E_TYPE'], ['return length();','E_ARGS'], ['return no_such_builtin();','E_INVARG'],
        ['return raise(E_TYPE,"reason");','E_TYPE']]) {
        const result = runtime.run(source);
        assert.equal(result.status, 'runtime-error', source);
        assert.equal(result.diagnostics[0].code, code, source);
        assert.ok(result.diagnostics[0].span, source);
      }
    } finally { runtime.dispose(); }
  });
}

test('profiles preserve different integer widths, remainder and negative power behavior', async () => {
  for (const profile of ['lambdamoo','toaststunt']) {
    const runtime = await createRuntime({ profile });
    try {
      assert.deepEqual(runtime.run('return -5 % 2;').value, moo.int(profile === 'lambdamoo' ? -1 : 1));
      assert.deepEqual(runtime.run('return -5.0 % 2.0;').value, moo.float(profile === 'lambdamoo' ? -1 : 1));
      assert.deepEqual(runtime.run('return 2147483647 + 1;').value, moo.int(profile === 'lambdamoo' ? -2147483648n : 2147483648n));
      assert.deepEqual(runtime.run('return (-1) ^ -3;').value, moo.int(profile === 'lambdamoo' ? -1 : 1));
      assert.equal(runtime.run('return (-1.0) ^ 0.5;').diagnostics[0].code, profile === 'lambdamoo' ? 'E_INVARG' : 'E_FLOAT');
    } finally { runtime.dispose(); }
  }
});

test('ToastStunt maps sort scalar keys, overwrite without aliases, and compare values', async () => {
  const runtime = await createRuntime({ profile: 'toaststunt' });
  try {
    const result = runtime.run('m=["z"->2,"a"->1,"A"->3]; n=m; m["a"]=4; return {mapkeys(m),mapvalues(m),n["a"],m["A"],3 in n, ![], !m};');
    assert.equal(result.status, 'completed', JSON.stringify(result.diagnostics));
    assert.deepEqual(result.value, moo.list([moo.list([moo.string('a'),moo.string('z')]),moo.list([moo.int(4),moo.int(2)]),moo.int(3),moo.int(4),moo.int(1),moo.int(1),moo.int(0)]));
    assert.equal(runtime.run('return [1->2][3];').diagnostics[0].code,'E_RANGE');
    assert.equal(runtime.run('return [{}->2];').diagnostics[0].code,'E_TYPE');
    assert.equal(runtime.run('return [][{}];').diagnostics[0].code,'E_TYPE');
    assert.deepEqual(runtime.run('return toliteral(["z"->2,"a"->1]);').value,moo.string('["a" -> 1, "z" -> 2]'));
    assert.deepEqual(runtime.run('return "B" in "abc";').value,moo.int(2));
    assert.deepEqual(runtime.run('m=["A"->1,"b"->2]; return {maphaskey(m,"a"),maphaskey(m,"a",1),mapvalues(m,"b","A"),mapdelete(m,"a"),length(m)};').value,
      moo.list([moo.int(1),moo.int(0),moo.list([moo.int(2),moo.int(1)]),moo.map([[moo.string('b'),moo.int(2)]]),moo.int(2)]));
    assert.equal(runtime.run('return mapvalues(["A"->1],"a");').diagnostics[0].code,'E_RANGE');
    assert.deepEqual(runtime.run('m=[1->2]; try m=mapdelete(m,{1,3}); except (E_RANGE) return m; endtry').value,moo.map([[moo.int(1),moo.int(2)]]));
  } finally { runtime.dispose(); }
});

test('unsupported syntax in dead code is rejected before execution', async () => {
  const runtime = await createRuntime({ profile: 'lambdamoo' });
  try {
    for (const source of ['return 7; fork(0) return 8; endfork', 'return 7; if(0) return [1->2]; endif', 'return 7; x=1 &. 2;']) {
      const result = runtime.run(source);
      assert.equal(result.status,'unsupported-feature'); assert.equal(result.statistics.steps,0);
    }
    for (const source of ['break;', 'return $;', 'return 2147483648;', 'return E_FAKE;']) assert.equal(runtime.run(source).status,'syntax-error',source);
  } finally { runtime.dispose(); }
});

for (const profile of ['lambdamoo', 'toaststunt']) {
  test(`${profile}: scatter matches the manual including defaults and middle rest`, async () => {
    const runtime = await createRuntime({profile});
    const source = 'b=c=e=17; {a,?b,?c=8,@d,?e=9,f}=args; return {a,b,c,d,e,f};';
    const expected = [
      [1,17,8,[],9,2], [1,2,8,[],9,3], [1,2,3,[],9,4],
      [1,2,3,[],4,5], [1,2,3,[4],5,6], [1,2,3,[4,5],6,7],
    ];
    const value = x => Array.isArray(x) ? moo.list(x.map(value)) : moo.int(x);
    try {
      for (let count=2;count<=7;count++) {
        const result=runtime.run(source,{context:{args:Array.from({length:count},(_,i)=>moo.int(i+1))}});
        assert.equal(result.status,'completed',JSON.stringify(result.diagnostics));
        assert.deepEqual(result.value,value(expected[count-2]));
      }
      assert.equal(runtime.run('{a,b}={1};').diagnostics[0].code,'E_ARGS');
      assert.equal(runtime.run('{a}={1,2};').diagnostics[0].code,'E_ARGS');
      assert.deepEqual(runtime.run('{?a=b,b}={7}; return a;').value,moo.int(7));
      assert.deepEqual(runtime.run('a=9; {?a}={}; return a;').value,moo.int(9));
    } finally { runtime.dispose(); }
  });
  test(`${profile}: catches, code evaluation order and finally control transfer`, async () => {
    const runtime=await createRuntime({profile});
    try {
      for(const [source,expected] of [
        ["return `1/0 ! ANY';",moo.error('E_DIV')],
        ["return `1/0 ! E_DIV => 7';",moo.int(7)],
        ["x=0; y=`x ! (x=1)'; return y;",moo.int(1)],
        ['try raise(E_TYPE,"reason",{7}); except e (E_TYPE) return e[1..3]; endtry',moo.list([moo.error('E_TYPE'),moo.string('reason'),moo.list([moo.int(7)])])],
        ['try 1/0; except (E_TYPE) return 1; except (E_DIV) return 2; except (ANY) return 3; endtry',moo.int(2)],
        ['x=0; try return x; except ((x=2)) return 99; endtry',moo.int(2)],
        ['try return 1; finally return 2; endtry',moo.int(2)],
        ['try 1/0; finally return 7; endtry',moo.int(7)],
        ['x=0; for i in {1,2} try continue; finally x=x+1; endtry endfor return x;',moo.int(2)],
        ['try try 1/0; finally x=7; endtry except (E_DIV) return x; endtry',moo.int(7)],
        ['codes={E_DIV}; try 1/0; except e (@codes) return e[1]; endtry',moo.error('E_DIV')],
      ]) {
        const result=runtime.run(source); assert.equal(result.status,'completed',`${source}: ${JSON.stringify(result.diagnostics)}`); assert.deepEqual(result.value,expected,source);
      }
      assert.equal(runtime.run("return `1/0 ! E_TYPE';").diagnostics[0].code,'E_DIV');
      assert.equal(runtime.run('try return 1; finally raise(E_TYPE); endtry').diagnostics[0].code,'E_TYPE');
      for(const source of ['try while(1) endwhile except (ANY) return 7; endtry','try while(1) endwhile finally return 7; endtry',"while(1) x=`1 ! ANY => 7'; endwhile"]) {
        const result=runtime.run(source,{limits:{steps:50}}); assert.equal(result.status,'limit-exceeded',source); assert.ok(result.diagnostics[0].span);
      }
    } finally {runtime.dispose();}
  });
}

test('budgets bound infinite loops, expensive comparisons, power and string growth', async () => {
  const runtime = await createRuntime({ profile:'toaststunt' });
  try {
    for (const [source, limits] of [
      ['while(1) endwhile',{steps:20}], ['s="x"; while(1) s=s+s; endwhile',{allocations:100}],
      ['return "abcdefghijklmnop" == "ABCDEFGHIJKLMNOP";',{steps:10}],
      ['return 2 ^ 9223372036854775807;',{steps:20}]]) {
      assert.equal(runtime.run(source,{limits}).status,'limit-exceeded',source);
    }
    assert.equal(runtime.run('return 2;').status,'completed');
  } finally { runtime.dispose(); }
});

test('program ownership, fresh invocation frames and dispose are enforced', async () => {
  const first = await createRuntime({profile:'lambdamoo'}), second = await createRuntime({profile:'lambdamoo'});
  try {
    const compilation = first.compile('return args[1];'); assert.equal(compilation.ok,true);
    assert.deepEqual(first.execute(compilation.program,{context:{args:[moo.int(7)]}}).value,moo.int(7));
    assert.throws(()=>second.execute(compilation.program),HostError);
    first.run('private=7;'); assert.equal(first.run('return private;').diagnostics[0].code,'E_VARNF');
    first.dispose(); assert.throws(()=>first.execute(compilation.program),HostError);
  } finally { first.dispose(); second.dispose(); }
});
