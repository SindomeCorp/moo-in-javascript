import { test, expect } from '@playwright/test';
test('static browser and dedicated worker load shipped WASM', async ({ page }) => {
  await page.goto('/tests/browser/index.html');
  const result = await page.evaluate(async () => {
    const { createParser } = await import('/dist/browser/index.js');
    const parser = await createParser({ profile: 'lambdamoo' });
    try { return parser.parse('return 42;'); } finally { parser.dispose(); }
  });
  expect(result.ok).toBe(true);
  const workerResult = await page.evaluate(async () => {
    const worker = new Worker('/tests/browser/worker.js', { type: 'module' });
    try {
      return await new Promise((resolve, reject) => {
        worker.onmessage = event => resolve(event.data);
        worker.onerror = event => reject(new Error(event.message));
        worker.postMessage({ type: 'parse', id: 'browser-1', source: 'return [1 -> 2];', options: { profile: 'toaststunt' } });
      });
    } finally { worker.terminate(); }
  });
  expect(workerResult.type).toBe('parsed');
  expect(workerResult.id).toBe('browser-1');
  expect(workerResult.result.ok).toBe(true);
});

test('bundled browser runtime executes both profiles with controlled failures', async ({ page }) => {
  await page.goto('/tests/browser/index.html');
  const results = await page.evaluate(async () => {
    const { createRuntime, encodeValue } = await import('/dist/browser/index.js');
    const results = [];
    for (const profile of ['lambdamoo', 'toaststunt']) {
      const runtime = await createRuntime({ profile });
      try {
        const result = runtime.run('sum=0; for i in [1..4] sum=sum+i; endfor return sum;');
        results.push([result.status, encodeValue(result.value, { profile }), runtime.run('try while(1) endwhile except (ANY) return 7; endtry', { limits: { steps: 20 } }).status]);
      } finally { runtime.dispose(); }
    }
    return results;
  });
  expect(results).toEqual(Array(2).fill(['completed', { type: 'int', value: '10' }, 'limit-exceeded']));
});

test('bundled fixture shares world/value identity with core and streams real verb output', async ({ page }) => {
  await page.goto('/tests/browser/index.html');
  const result = await page.evaluate(async () => {
    const { createRuntime, moo } = await import('/dist/browser/index.js');
    const { createTeachingWorld } = await import('/dist/browser/fixtures.js');
    const world = createTeachingWorld({ profile: 'toaststunt' });
    const runtime = await createRuntime({ profile: 'toaststunt' });
    const events = [];
    try {
      const result = runtime.run('this.lamp_on=1; player:tell("ready");', { world,
        context: { this: moo.object(42), player: moo.object(7) }, onOutput: event => events.push(event.text) });
      return [result.status, world.getProperty(42n, 'lamp_on').value.toString(), events];
    } finally { runtime.dispose(); }
  });
  expect(result).toEqual(['completed', '1', ['ready']]);
});

test('browser snapshots restore source, tagged maps and session reset', async ({ page }) => {
  await page.goto('/tests/browser/index.html');
  const result = await page.evaluate(async () => {
    const { createRuntime, createSession, loadWorld, moo } = await import('/dist/browser/index.js');
    const { createTeachingWorld } = await import('/dist/browser/fixtures.js');
    const runtime = await createRuntime({ profile: 'toaststunt' });
    try {
      const world = createTeachingWorld({ profile: 'toaststunt' });
      const session = createSession({ runtime, world });
      const context = { this: moo.object(42), player: moo.object(7) };
      session.run('this.lamp_on=["key" -> 7];', { context });
      const json = session.save();
      session.reset();
      const reset = world.getProperty(42n, 'lamp_on').value.toString();
      session.load(json);
      const restored = await loadWorld(json);
      const run = runtime.run('player:tell(this.lamp_on["key"]);', { world: restored, context });
      return [reset, restored.profile, run.status, run.output.map(event => event.text)];
    } finally { runtime.dispose(); }
  });
  expect(result).toEqual(['0', 'toaststunt', 'completed', ['7']]);
});

test('browser worker streams output, discards Stop and commits subsequent runs', async ({ page }) => {
  await page.goto('/tests/browser/index.html');
  const result = await page.evaluate(async () => {
    const { createRuntime, createWorkerSession, moo } = await import('/dist/browser/index.js');
    const { createTeachingWorld } = await import('/dist/browser/fixtures.js');
    const runtime = await createRuntime({ profile: 'toaststunt' });
    const world = createTeachingWorld({ profile: 'toaststunt' });
    const session = createWorkerSession({ runtime, world });
    const context = { this: moo.object(42), player: moo.object(7) };
    try {
      let run;
      run = session.run('this.lamp_on=9; player:tell("live"); while (1) endwhile', { context, limits: { steps: 1e12 }, onOutput() { run.stop(); } });
      const stopped = await run.result;
      const discarded = world.getProperty(42n, 'lamp_on').value === 0n;
      const completed = await session.run('this.lamp_on=2; return ["answer" -> 42];', { context }).result;
      return { stopped: stopped.status, text: stopped.output[0].text, discarded, completed: completed.status,
        map: completed.value.type, lamp: String(world.getProperty(42n, 'lamp_on').value) };
    } finally { runtime.dispose(); }
  });
  expect(result).toEqual({ stopped: 'cancelled', text: 'live', discarded: true, completed: 'completed', map: 'map', lamp: '2' });
});

test('static playground runs, safely renders output, stops and restores snapshots', async ({ page }) => {
  await page.goto('/examples/browser/index.html');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.locator('#source').fill('this.lamp_on=1; player:tell("<img src=x onerror=alert(1)>"); return 1;');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('completed');
  await expect(page.locator('#output')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#output img')).toHaveCount(0);
  await page.locator('#save').click();
  const snapshot = await page.locator('#snapshot').inputValue();
  await page.locator('#source').fill('this.lamp_on=9; player:tell("before stop"); while (1) endwhile');
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('before stop');
  await page.locator('#stop').click();
  await expect(page.locator('#status')).toHaveText('cancelled');
  await page.locator('#save').click();
  await expect(page.locator('#snapshot')).toHaveValue(snapshot);
  await page.locator('#reset').click();
  await page.locator('#load').click();
  await expect(page.locator('#status')).toHaveText('Snapshot loaded');
  const committed = await page.locator('#world').textContent();
  await page.locator('#snapshot').fill('{broken');
  await page.locator('#load').click();
  await expect(page.locator('#status')).toHaveText('Host error');
  await expect(page.locator('#world')).toHaveText(committed);
  await page.locator('#source').fill('if');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('syntax-error');
  await page.locator('#profile').selectOption('toaststunt');
  await expect(page.locator('#status')).toHaveText('Ready');
  await page.locator('#source').fill('return ["answer" -> 42];');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('completed');
  await expect(page.locator('#result')).toContainText('"type": "map"');
});
