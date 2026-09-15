import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createParser, HostError } from '../dist/index.js';

test('profile is mandatory and host failures are not syntax diagnostics', async () => {
  await assert.rejects(createParser({}), HostError);
  await assert.rejects(createParser({ profile: 'toaststunt', grammarWasm: new Uint8Array([1, 2]) }), HostError);
});

for (const profile of ['lambdamoo', 'toaststunt']) {
  test(`${profile}: owned syntax survives disposal, with fields and positions`, async () => {
    const parser = await createParser({ profile });
    const result = parser.parse('return 1 + 2;');
    parser.dispose();
    parser.dispose();
    assert.equal(result.ok, true);
    const expression = result.syntax.children[0].children[1];
    assert.equal(expression.kind, 'binary_expression');
    assert.deepEqual(expression.children.map(n => [n.field, n.text]), [['left', '1'], ['operator', '+'], ['right', '2']]);
    assert.equal(expression.span.start.offset, 7);
    assert.equal(expression.span.end.offset, 12);
    assert.doesNotThrow(() => JSON.stringify(result));
    assert.throws(() => parser.parse(''), HostError);
  });
  test(`${profile}: malformed programs and unreachable fork are rejected`, async () => {
    const parser = await createParser({ profile });
    try {
      for (const source of ['return "unfinished;', 'return (1;', 'return 1 + ;']) {
        const result = parser.parse(source);
        assert.equal(result.ok, false, source);
        assert.ok(result.diagnostics.some(d => d.category === 'syntax-error'));
      }
      const result = parser.parse('if (0) fork (0) return 1; endfork endif');
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics[0].category, 'unsupported-feature');
    } finally { parser.dispose(); }
  });
}

test('maps are rejected in LambdaMOO, accepted as syntax in ToastStunt', async () => {
  for (const profile of ['lambdamoo', 'toaststunt']) {
    const parser = await createParser({ profile });
    try { assert.equal(parser.parse('return ["a" -> 1];').ok, profile === 'toaststunt'); }
    finally { parser.dispose(); }
  }
});

test('grammar fixture baseline separates parsed and intentionally unsupported', async t => {
  const parser = await createParser({ profile: 'toaststunt' });
  let parsed = 0, unsupported = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.moo')) {
        const result = parser.parse(await readFile(path, 'utf8'));
        if (result.ok) parsed++;
        else {
          assert.ok(result.diagnostics.every(d => d.category === 'unsupported-feature'), `${path}: ${JSON.stringify(result)}`);
          unsupported++;
        }
      }
    }
  }
  try { await walk('vendor/tree-sitter-moo/fixtures/valid'); }
  finally { parser.dispose(); }
  assert.equal(parsed + unsupported, 447);
  t.diagnostic(`${parsed} parsed; ${unsupported} intentionally unsupported; 0 syntax failures. Execution is not tested here.`);
});
