import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, moo } from '../dist/index.js';
for (const profile of ['lambdamoo', 'toaststunt']) test(profile + ': IEEE float boundaries follow the documented profile', async () => {
  const runtime = await createRuntime({ profile });
  try {
    for (const [source, code] of [
      ['return 1e308 * 10.0;', 'E_FLOAT'],
      ['return (-1.0) ^ 0.5;', profile === 'lambdamoo' ? 'E_INVARG' : 'E_FLOAT'],
      ['return 1.0 / -0.0;', 'E_DIV'],
      ['return 0.0 ^ -1;', 'E_FLOAT'],
    ]) {
      const result = runtime.run(source);
      assert.equal(result.status, 'runtime-error', source);
      assert.equal(result.diagnostics[0].code, code, source);
    }
    assert.deepEqual(runtime.run('return 5e-324;').value, moo.float(Number.MIN_VALUE));
    assert.deepEqual(runtime.run('return -5e-324 / 2.0;').value, moo.float(-0));
    assert.deepEqual(runtime.run('return 1e-300 * 1e-100;').value, moo.float(0));
    // The pinned ToastStunt fmod(fmod(n,d)+d,d) loses this small remainder.
    assert.deepEqual(runtime.run('return 1.0 % 1e20;').value, moo.float(profile === 'toaststunt' ? 0 : 1));
  } finally { runtime.dispose(); }
});
