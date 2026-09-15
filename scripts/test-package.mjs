import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const pack = JSON.parse(execFileSync('npm', ['pack', '--json'], { encoding: 'utf8' }))[0];
assert.ok(pack.files.some(f => f.path === 'assets/tree-sitter-moo.wasm'));
assert.ok(pack.files.some(f => f.path === 'dist/index.d.ts'));
assert.ok(pack.files.some(f => f.path === 'dist/worker/browser.js'));
assert.ok(pack.files.some(f => f.path === 'examples/browser/index.html'));
assert.ok(pack.files.some(f => f.path === 'examples/node.mjs'));
assert.ok(pack.files.some(f => f.path === 'assets/web-tree-sitter.LICENSE'));
assert.ok(pack.files.every(f => !/^(vendor|tests|scripts|node_modules)\//.test(f.path)));
const temporary = await mkdtemp(join(tmpdir(), 'moo-consumer-'));
try {
  await writeFile(join(temporary, 'package.json'), '{"private":true,"type":"module"}');
  execFileSync('npm', ['install', '--ignore-scripts', resolve(pack.filename)], { cwd: temporary, stdio: 'pipe' });
  await writeFile(join(temporary, 'check.mjs'), `
    import assert from 'node:assert/strict';
    import { createParser, createRuntime, createSession, createWorkerSession, loadWorld, moo } from 'moo-in-javascript';
    import { createTeachingWorld } from 'moo-in-javascript/fixtures';
    import { nodeWorkerFactory } from 'moo-in-javascript/node-worker';
    for (const profile of ['lambdamoo', 'toaststunt']) {
      const parser = await createParser({ profile });
      try { assert.equal(parser.parse('return 7;').ok, true); } finally { parser.dispose(); }
      const runtime = await createRuntime({ profile });
      try {
        assert.deepEqual(runtime.run('return 7;').value, moo.int(7));
        const world = createTeachingWorld({ profile });
        const result = runtime.run('this.lamp_on=1; player:tell("packed");', { world, context: { this: moo.object(42), player: moo.object(7) } });
        assert.equal(result.status, 'completed'); assert.equal(result.output[0].text, 'packed');
        assert.equal(world.getProperty(42n, 'lamp_on').value, 1n);
        const session = createSession({ runtime, world });
        const saved = session.save();
        session.run('this.lamp_on=2;', { context: { this: moo.object(42) } });
        session.reset(); assert.equal(world.getProperty(42n, 'lamp_on').value, 1n);
        const restored = await loadWorld(saved);
        assert.equal(restored.profile, profile); assert.equal(restored.getProperty(42n, 'lamp_on').value, 1n);
        const isolated = createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() });
        assert.equal((await isolated.run('return 42;').result).value.value, 42n);
      } finally { runtime.dispose(); }
    }
  `);
  execFileSync(process.execPath, ['check.mjs'], { cwd: temporary, stdio: 'inherit' });
  const example = execFileSync(process.execPath, ['node_modules/moo-in-javascript/examples/node.mjs'], { cwd: temporary, encoding: 'utf8' });
  assert.match(example, /Hello from MOO/); assert.match(example, /Restored lamp: 1/);
  await writeFile(join(temporary, 'check.ts'), `
    import { createParser, createRuntime, moo, encodeValue, type MooValue } from 'moo-in-javascript';
    const value: MooValue = moo.int(7n);
    encodeValue(value, { profile: 'lambdamoo' });
    const parser = await createParser({ profile: 'toaststunt' });
    parser.parse('return 7;'); parser.dispose();
    const runtime = await createRuntime({ profile: 'lambdamoo' });
    const result = runtime.run('return 7;');
    if (result.status === 'completed') encodeValue(result.value, { profile: 'lambdamoo' });
    runtime.dispose();
  `);
  execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit',
    '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', 'check.ts'], { cwd: temporary, stdio: 'inherit' });
  const packageRoot = join(temporary, 'node_modules/moo-in-javascript');
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Clean consumer</title>'); return; }
      if (!url.pathname.startsWith('/subpath/moo/')) throw new Error('outside mount');
      const file = resolve(packageRoot, decodeURIComponent(url.pathname.slice('/subpath/moo/'.length)));
      if (!file.startsWith(packageRoot + sep)) throw new Error('outside package');
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' })[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch(process.env.MOO_BROWSER_EXECUTABLE ? { executablePath: process.env.MOO_BROWSER_EXECUTABLE } : {});
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => {
      const { createParser, createRuntime, createWorkerSession, loadWorld, moo } = await import('/subpath/moo/dist/browser/index.js');
      const { createTeachingWorld } = await import('/subpath/moo/dist/browser/fixtures.js');
      const results = [];
      for (const profile of ['lambdamoo', 'toaststunt']) {
        const parser = await createParser({ profile,
          grammarWasm: new URL('/subpath/moo/assets/tree-sitter-moo.wasm', location.href).href,
          runtimeWasm: new URL('/subpath/moo/assets/tree-sitter.wasm', location.href).href });
        try { results.push(parser.parse('return 7;').ok); } finally { parser.dispose(); }
        const world = createTeachingWorld({ profile }), runtime = await createRuntime({ profile });
        try {
          const result = runtime.run('this.lamp_on=1; player:tell("packed");', { world, context: { this: moo.object(42), player: moo.object(7) } });
          results.push(result.status === 'completed' && result.output[0].text === 'packed' && world.getProperty(42n, 'lamp_on').value === 1n);
          const restored = await loadWorld(runtime.saveWorld(world));
          const afterLoad = runtime.run('player:tell(this.lamp_on);', { world: restored, context: { this: moo.object(42), player: moo.object(7) } });
          results.push(afterLoad.status === 'completed' && afterLoad.output[0].text === '1');
          const isolated = createWorkerSession({ runtime, world });
          let run;
          run = isolated.run('this.lamp_on=9; player:tell("stop"); while (1) endwhile', { context: { this: moo.object(42), player: moo.object(7) }, limits: { steps: 1e12 }, onOutput() { run.stop(); } });
          const stopped = await run.result;
          results.push(stopped.status === 'cancelled' && stopped.output[0].text === 'stop' && world.getProperty(42n, 'lamp_on').value === 1n);
          const restarted = await isolated.run('this.lamp_on=3; return 42;', { context: { this: moo.object(42) } }).result;
          results.push(restarted.status === 'completed' && world.getProperty(42n, 'lamp_on').value === 3n);
        } finally { runtime.dispose(); }
      }
      const worker = new Worker('/subpath/moo/dist/worker/browser.js', { type: 'module' });
      try {
        results.push(await new Promise((resolve, reject) => {
          worker.onmessage = e => resolve(e.data.type === 'parsed' && e.data.result.ok);
          worker.onerror = e => reject(new Error(e.message));
          worker.postMessage({ type: 'parse', id: 'packed', source: 'return 7;', options: { profile: 'toaststunt' } });
        }));
      } finally { worker.terminate(); }
      return results;
    });
    assert.deepEqual(result, Array(11).fill(true));
    await page.goto(`http://127.0.0.1:${server.address().port}/subpath/moo/examples/browser/index.html`);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Ready');
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'completed');
    assert.match(await page.locator('#output').textContent(), /Lamp: 1/);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
  console.log('Clean packed Node, TypeScript and browser consumers passed, including subpath WASM overrides and worker.');
} finally { await rm(temporary, { recursive: true, force: true }); await rm(pack.filename); }
