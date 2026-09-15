import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, moo } from '../dist/index.js';
for (const profile of ['lambdamoo', 'toaststunt']) {
  test(profile + ': manual string search semantics and charged comparisons', async () => {
    const runtime = await createRuntime({ profile });
    try {
      for (const [expression, expected] of [
        ['index("foobar","o")',2], ['rindex("foobar","o")',3], ['index("foobar","x")',0],
        ['index("foobar","oba")',3], ['index("Foobar","foo",1)',0], ['index("Foobar","foo")',1],
        ['index("Foobar","foo",#7)',1], ['index("Foobar","foo",{1})',0],
        ['index("abc","")',1], ['rindex("abc","")',4], ['index("","")',1], ['rindex("","")',1],
        ['index("ab","abc")',0], ['rindex("ab","abc")',0], ['rindex("aaaa","aa")',3],
      ]) assert.deepEqual(runtime.run('return '+expression+';').value, moo.int(expected), expression);
      for (const [expression, code] of [['index(1,"a")','E_TYPE'], ['index("a")','E_ARGS'], ['rindex("a",1)','E_TYPE']]) {
        assert.equal(runtime.run('return '+expression+';').diagnostics[0].code, code);
      }
      if (profile === 'toaststunt') {
        // ToastStunt returns forward positions relative to the offset suffix.
        assert.deepEqual(runtime.run('return {index("ababa","a",0,2),rindex("ababa","a",0,-1)};').value, moo.list([moo.int(1),moo.int(3)]));
        for (const expression of ['index("a","a",0,-1)','index("a","a",0,2)','rindex("a","a",0,1)','rindex("a","a",0,-2)']) assert.equal(runtime.run('return '+expression+';').diagnostics[0].code,'E_INVARG');
      } else assert.equal(runtime.run('return index("abc","a",0,0);').diagnostics[0].code,'E_ARGS');
      const limited = runtime.run('return index(args[1],args[2]);', { context: { args: [moo.string('a'.repeat(1000)),moo.string('a'.repeat(100)+'b')] }, limits: { steps: 200 } });
      assert.equal(limited.status, 'limit-exceeded');
    } finally { runtime.dispose(); }
  });
}
