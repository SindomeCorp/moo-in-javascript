import { createRuntime, createWorkerSession, moo, encodeValue } from '../dist/index.js';
import { nodeWorkerFactory } from '../dist/worker/node-client.js';
import { createTeachingWorld } from '../dist/fixtures/index.js';
const runtime = await createRuntime({ profile: 'toaststunt' });
try {
  const session = createWorkerSession({ runtime, world: createTeachingWorld({ profile: runtime.profile }), workerFactory: nodeWorkerFactory() });
  const context = { this: moo.object(42), player: moo.object(7) };
  const run = session.run('this.lamp_on=1; player:tell("Hello from MOO"); return ["lamp" -> this.lamp_on];', {
    context, onOutput: event => console.log(event.text),
  });
  const result = await run.result;
  console.log(result.status, result.status === 'completed' ? encodeValue(result.value, { profile: runtime.profile }) : result.diagnostics);
  const snapshot = session.save();
  session.reset(); session.load(snapshot);
  console.log('Restored lamp:', session.world.getProperty(42n, 'lamp_on').value.toString());
} finally { runtime.dispose(); }
