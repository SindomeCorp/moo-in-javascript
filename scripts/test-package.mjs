import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

if (process.argv.length > 3) throw new Error('Usage: node scripts/test-package.mjs [package.tgz]');
const suppliedTarball = process.argv[2];
const tarball = resolve(suppliedTarball ?? JSON.parse(
  execFileSync('npm', ['pack', '--json'], { encoding: 'utf8' }),
)[0].filename);
const expectedPackage = JSON.parse(await readFile('package.json', 'utf8'));
const temporary = await mkdtemp(join(tmpdir(), 'moo-consumer-'));
try {
  await writeFile(join(temporary, 'package.json'), '{"private":true,"type":"module"}');
  execFileSync('npm', ['install', '--ignore-scripts', tarball], { cwd: temporary, stdio: 'pipe' });
  const packageRoot = join(temporary, 'node_modules/@sindomecorp/moo-in-javascript');
  const installedPackage = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(installedPackage.name, expectedPackage.name);
  assert.equal(installedPackage.version, expectedPackage.version);
  const files = (await readdir(packageRoot, { recursive: true })).map(path => path.split(sep).join('/'));
  for (const file of ['assets/tree-sitter-moo.wasm', 'assets/tree-sitter.wasm',
    'dist/index.d.ts', 'dist/worker/browser.js', 'examples/browser/index.html',
    'examples/node.mjs', 'assets/tree-sitter-moo.LICENSE', 'assets/web-tree-sitter.LICENSE',
    'LICENSE', 'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/third-party-notices.md']) {
    assert.ok(files.includes(file), `Missing packaged file: ${file}`);
  }
  assert.ok(files.every(file => !/^(vendor|tests|scripts|node_modules|build|coverage|\.github)(\/|$)/.test(file)));
  await writeFile(join(temporary, 'check.mjs'), `
    import assert from 'node:assert/strict';
    import { createParser, createRuntime, createSession, createWorkerSession, listBuiltins, getBuiltinInfo, loadWorld, moo } from '@sindomecorp/moo-in-javascript';
    import { createTeachingWorld } from '@sindomecorp/moo-in-javascript/fixtures';
    import { nodeWorkerFactory } from '@sindomecorp/moo-in-javascript/node-worker';
    for (const profile of ['lambdamoo', 'toaststunt']) {
      const parser = await createParser({ profile });
      try { assert.equal(parser.parse('return 7;').ok, true); } finally { parser.dispose(); }
      const runtime = await createRuntime({ profile });
      try {
        assert.deepEqual(runtime.run('return 7;').value, moo.int(7));
        assert.equal(listBuiltins({profile}).length, profile === 'toaststunt' ? 218 : 119);
        assert.equal(getBuiltinInfo('NOTIFY',{profile}).maxArgs, 2);
        assert.equal(runtime.run('return function_info("notify");').value.value[0].value, 'notify');
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
  const readme = await readFile(join(packageRoot, 'README.md'), 'utf8');
  const snippets = [...readme.matchAll(/^```js\n([\s\S]*?)^```/gm)];
  assert.equal(snippets.length, 2, 'Expected the Node quick start and worker examples');
  for (const [index, snippet] of snippets.entries()) {
    const filename = `readme-${index}.mjs`;
    await writeFile(join(temporary, filename), snippet[1]);
    const output = execFileSync(process.execPath, [filename], { cwd: temporary, encoding: 'utf8' });
    assert.match(output, index === 0 ? /type: 'int', value: '3'/ : /Ready\.[\s\S]*completed/);
  }
  const browserExample = readme.match(/^```html\n([\s\S]*?)^```/m)?.[1];
  assert.ok(browserExample, 'Expected the browser quick start');
  const example = execFileSync(process.execPath, ['node_modules/@sindomecorp/moo-in-javascript/examples/node.mjs'], { cwd: temporary, encoding: 'utf8' });
  assert.match(example, /Hello from MOO/); assert.match(example, /Restored lamp: 1/);
  await writeFile(join(temporary, 'check.ts'), `
    import { createParser, createRuntime, moo, encodeValue, listBuiltins, getBuiltinInfo, type BuiltinInfo, type MooValue } from '@sindomecorp/moo-in-javascript';
    const entries: readonly BuiltinInfo[] = listBuiltins({ profile: 'lambdamoo' });
    const info: BuiltinInfo | undefined = getBuiltinInfo('notify', { profile: 'toaststunt' });
    const value: MooValue = moo.int(7n);
    encodeValue(value, { profile: 'lambdamoo' });
    const parser = await createParser({ profile: 'toaststunt' });
    parser.parse('return 7;'); parser.dispose();
    const runtime = await createRuntime({ profile: 'lambdamoo' });
    const result = runtime.run('return 7;');
    if (result.status === 'completed') encodeValue(result.value, { profile: 'lambdamoo' });
    const fromRuntime: readonly BuiltinInfo[] = runtime.listBuiltins();
    runtime.getBuiltinInfo('function_info');
    runtime.dispose();
  `);
  execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit',
    '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', 'check.ts'], { cwd: temporary, stdio: 'inherit' });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Clean consumer</title>'); return; }
      if (url.pathname === '/readme-example.html') {
        res.setHeader('Content-Type', 'text/html'); res.end(browserExample); return;
      }
      const mount = ['/subpath/moo/', '/vendor/moo/'].find(prefix => url.pathname.startsWith(prefix));
      if (!mount) throw new Error('outside mount');
      const file = resolve(packageRoot, decodeURIComponent(url.pathname.slice(mount.length)));
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
    await page.goto(`http://127.0.0.1:${server.address().port}/readme-example.html`);
    await page.waitForFunction(() => document.querySelector('#result')?.textContent === '{"type":"int","value":"42"}');
    await page.goto(`http://127.0.0.1:${server.address().port}/subpath/moo/examples/browser/index.html`);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'Ready');
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'completed');
    assert.match(await page.locator('#output').textContent(), /Lamp: 1/);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
  await rm(join(packageRoot, 'assets'), { recursive: true });
  await writeFile(join(temporary, 'catalog-only.mjs'), `
    import assert from 'node:assert/strict';
    import { listBuiltins, getBuiltinInfo } from '@sindomecorp/moo-in-javascript';
    assert.equal(listBuiltins({profile:'toaststunt'}).length,218);
    assert.equal(getBuiltinInfo('notify',{profile:'lambdamoo'}).maxArgs,2);
  `);
  execFileSync(process.execPath, ['catalog-only.mjs'], { cwd: temporary, stdio: 'inherit' });
  console.log('Clean packed Node, TypeScript and browser consumers passed, including subpath WASM overrides and worker.');
} finally { await rm(temporary, { recursive: true, force: true }); if (!suppliedTarball) await rm(tarball, { force: true }); }
