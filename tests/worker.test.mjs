import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, createWorkerSession, moo, WorkerHostError } from '../dist/index.js';
import { nodeWorkerFactory } from '../dist/worker/node-client.js';
import { createTeachingWorld } from '../dist/fixtures/index.js';
const context = { this: moo.object(42), player: moo.object(7) };
for (const profile of ['lambdamoo', 'toaststunt']) {
  test(profile + ': worker terminal commits success, MOO errors and controlled limits', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
    const session = createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() });
    try {
      const output = [];
      const success = await session.run('this.lamp_on=1; player:tell("live"); return {this.lamp_on};', { context, onOutput: event => output.push(event) }).result;
      assert.equal(success.status, 'completed'); assert.deepEqual(success.value, moo.list([moo.int(1)]));
      assert.equal(world.getProperty(42n, 'lamp_on').value, 1n); assert.equal(success.changes.length, 1);
      assert.equal(output.length, 1); assert.deepEqual(success.output, output);
      const error = await session.run('this.lamp_on=2; return 1/0;', { context }).result;
      assert.equal(error.status, 'runtime-error'); assert.equal(error.diagnostics[0].code, 'E_DIV');
      assert.equal(world.getProperty(42n, 'lamp_on').value, 2n);
      const limit = await session.run('this.lamp_on=3; while (1) endwhile', { context, limits: { steps: 100 } }).result;
      assert.equal(limit.status, 'limit-exceeded'); assert.equal(world.getProperty(42n, 'lamp_on').value, 3n);
      const syntax = await session.run('if', { context }).result;
      assert.equal(syntax.commit, 'discarded'); assert.equal(world.getProperty(42n, 'lamp_on').value, 3n);
      session.reset(); assert.equal(world.getProperty(42n, 'lamp_on').value, 0n);
    } finally { runtime.dispose(); }
  });
}
test('Stop from live output discards changes, locks committed state and allows restart', async () => {
  const profile = 'lambdamoo', runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
  const session = createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() });
  try {
    const before = session.save();
    let run;
    run = session.run('this.lamp_on=9; player:tell("before stop"); while (1) endwhile', { context, limits: { steps: 1e12 }, onOutput() {
      assert.throws(() => session.save()); assert.throws(() => session.reset());
      assert.throws(() => world.setProperty(42n, 'lamp_on', moo.int(8)));
      assert.throws(() => runtime.run('return 1;', { world }));
      run.stop();
    } });
    const result = await run.result;
    assert.equal(result.status, 'cancelled'); assert.equal(result.reason, 'stop');
    assert.equal(result.output[0].text, 'before stop'); assert.equal(result.statistics, null);
    assert.equal(session.save(), before);
    run.stop();
    assert.equal((await session.run('return 8;').result).value.value, 8n);
  } finally { runtime.dispose(); }
});
test('hard deadline, transport crash, callback failure and late terminal never commit', async () => {
  const profile = 'lambdamoo', runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
  try {
    const session = createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() });
    const before = session.save();
    const timeout = await session.run('this.lamp_on=8; while (1) endwhile', { context, timeoutMs: 200, limits: { steps: 1e12 } }).result;
    assert.equal(timeout.reason, 'timeout'); assert.equal(session.save(), before);
    await assert.rejects(session.run('this.lamp_on=9; player:tell("seen");', { context, onOutput() { throw new Error('callback failed'); } }).result, error => error instanceof WorkerHostError && error.output.length === 1 && error.commit === 'unavailable');
    assert.equal(session.save(), before);
    let receive, crash, request, terminated = 0;
    const fake = createWorkerSession({ runtime, world, workerFactory: () => ({ subscribe(m, e) { receive=m; crash=e; return () => {}; }, postMessage(r) { request=r; }, terminate() { terminated++; } }) });
    const run = fake.run('return 1;'); run.stop(); await run.result;
    receive({ type: 'host-error', id: request.id, message: 'late' });
    assert.equal(terminated, 1); assert.equal(fake.save(), before);
    const failed = fake.run('return 1;'); crash(new Error('crashed'));
    await assert.rejects(failed.result, /crashed/); assert.equal(fake.save(), before);
  } finally { runtime.dispose(); }
});

for (const profile of ['lambdamoo', 'toaststunt']) {
  test(profile + ': oversized results are controlled in both direct and worker execution', async () => {
    const runtime = await createRuntime({ profile });
    try {
      for (const source of [
        'this.lamp_on=1; player:tell("kept"); x=0; for i in [1..101] x={x}; endfor return x;',
        'this.lamp_on=1; player:tell("kept"); x=0; for i in [1..17] x={x,x}; endfor return x;',
      ]) {
        for (const isolated of [false, true]) {
          const world = createTeachingWorld({ profile });
          const result = isolated
            ? await createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() }).run(source, { context }).result
            : runtime.run(source, { world, context });
          assert.equal(result.status, 'limit-exceeded'); assert.equal(result.commit, 'committed');
          assert.match(result.diagnostics[0].message, /resultValue/);
          assert.equal(result.output[0].text, 'kept'); assert.equal(world.getProperty(42n, 'lamp_on').value, 1n);
        }
      }
    } finally { runtime.dispose(); }
  });
  test(profile + ': worker change reports preserve the sign of floating zero', async () => {
    const runtime = await createRuntime({ profile }), world = createTeachingWorld({ profile });
    try {
      world.setProperty(42n, 'lamp_on', moo.float(0));
      const session = createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() });
      const result = await session.run('this.lamp_on=-0.0;', { context }).result;
      assert.equal(result.status, 'completed'); assert.equal(result.changes.length, 1);
      assert.equal(result.changes[0].kind, 'object-updated');
      assert.ok(Object.is(world.getProperty(42n, 'lamp_on').value, -0));
      assert.equal((await session.run('return 0;', { context }).result).changes.length, 0);
    } finally { runtime.dispose(); }
  });
}

test('worker reserves terminal capacity for custom world quotas and JSON escaping', async () => {
  const profile = 'toaststunt', runtime = await createRuntime({ profile });
  try {
    const fixture = createTeachingWorld({ profile });
    const world = runtime.loadWorld(runtime.saveWorld(fixture), { worldLimits: { stringUnits: 4_000_000 } });
    // Each control character expands to six characters in JSON. The world fits
    // its quota while its serialized representation exceeds the default 16 MB.
    const value = moo.string('\u0001'.repeat(1_000_000));
    for (const name of ['large_a', 'large_b', 'large_c']) world.addProperty(42n, name, value, 7n, 'rw');
    assert.throws(() => runtime.saveWorld(world), /character limit/);
    const session = createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() });
    const result = await session.run('this.lamp_on=5; return 1/0;', { context, timeoutMs: 10000 }).result;
    assert.equal(result.status, 'runtime-error'); assert.equal(result.commit, 'committed');
    assert.equal(world.getProperty(42n, 'lamp_on').value, 5n);
    session.reset(); assert.equal(world.getProperty(42n, 'lamp_on').value, 0n);
    assert.equal(world.getProperty(42n, 'large_c').value.length, 1_000_000);
  } finally { runtime.dispose(); }
});
