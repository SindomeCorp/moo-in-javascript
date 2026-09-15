import { test } from 'node:test';
import { inspect } from 'node:util';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRuntime, decodeValue, encodeValue } from '../dist/index.js';
import { createTeachingWorld } from '../dist/fixtures/index.js';
const root = new URL('../vendor/moo-for-llms/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('./corpus/manifest.json', import.meta.url), 'utf8'));

test('reviewed corpus provenance and complete upstream smoke-candidate selection', async () => {
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), manifest.upstream.revision);
  assert.match(await readFile(new URL(manifest.upstream.licensePath, root), 'utf8'), /MIT License/);
  const smoke = JSON.parse(await readFile(new URL('docs/runtime-smoke-manifest.json', root), 'utf8'));
  for (const item of smoke) assert.ok(manifest.cases.some(test => test.id === item.id && test.path === item.path), item.id);
  const ids = new Set();
  for (const entry of manifest.cases) {
    assert.ok(!ids.has(entry.id)); ids.add(entry.id);
    assert.match(entry.path, /^examples\/[a-z0-9/-]+\.moo$/);
    const source = await readFile(new URL(entry.path, root), 'utf8');
    assert.equal(createHash('sha256').update(source).digest('hex'), entry.sha256, entry.path);
    assert.deepEqual(Object.fromEntries([...source.matchAll(/^"([a-z_]+): (.*?)";$/gm)].map(match => [match[1], match[2]])), entry.metadata);
    assert.equal(entry.metadata.license, 'MIT');
    assert.ok(entry.evidence.length > 40); assert.ok(entry.features.length);
  }
});
for (const profile of ['lambdamoo', 'toaststunt']) {
  test(profile + ': reviewed corpus exact values, errors, output and state', async t => {
    const runtime = await createRuntime({ profile });
    const counts = { parsed: 0, executable: 0, intentionallyUnsupported: 0, failing: 0 };
    try {
      for (const entry of manifest.cases.filter(entry => entry.profiles.includes(profile))) {
        const source = await readFile(new URL(entry.path, root), 'utf8');
        const world = createTeachingWorld({ profile });
        const before = runtime.saveWorld(world);
        const context = { this: decodeValue(entry.context.this, { profile }), player: decodeValue(entry.context.player, { profile }), args: entry.context.args.map(value => decodeValue(value, { profile })) };
        const compilation = runtime.compile(source);
        if (runtime.parser.parse(source).ok) counts.parsed++;
        if (compilation.ok) counts.executable++;
        const result = runtime.run(source, { world, context });
        try {
          assert.equal(result.status, entry.expected.status, entry.id + ': ' + inspect(result.diagnostics));
          assert.deepEqual(result.output, entry.expected.output, entry.id);
          assert.deepEqual(result.changes, entry.expected.changes, entry.id);
          assert.equal(runtime.saveWorld(world), before, entry.id);
          if (result.status === 'completed') assert.deepEqual(encodeValue(result.value, { profile }), entry.expected.value, entry.id);
          else if (result.status === 'runtime-error') assert.equal(result.diagnostics[0].code, entry.expected.code, entry.id);
          else {
            counts.intentionallyUnsupported++;
            assert.equal(result.commit, 'discarded'); assert.equal(result.statistics.steps, 0);
            assert.ok(result.diagnostics.every(diagnostic => diagnostic.category === 'unsupported-feature'));
          }
        } catch (error) { counts.failing++; throw error; }
      }
    } finally { runtime.dispose(); t.diagnostic(JSON.stringify(counts)); }
  });
}
