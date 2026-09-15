import { createRuntime, createWorkerSession, moo, encodeValue } from '../../dist/browser/index.js';
import { createTeachingWorld } from '../../dist/browser/fixtures.js';
const element = id => document.getElementById(id);
let runtime, session, active;
const showWorld = () => {
  element('world').textContent = JSON.stringify(JSON.parse(session.save()), null, 2);
};
const controls = busy => {
  for (const id of ['run', 'reset', 'save', 'load', 'profile']) element(id).disabled = busy;
  element('stop').disabled = !active;
};
const failure = error => { element('status').textContent = 'Host error'; element('result').textContent = error.message; };
async function initialize() {
  controls(true);
  try {
    const replacement = await createRuntime({ profile: element('profile').value });
    const replacementSession = createWorkerSession({ runtime: replacement, world: createTeachingWorld({ profile: replacement.profile }) });
    runtime?.dispose(); runtime = replacement; session = replacementSession;
    element('snapshot').value = ''; element('output').textContent = ''; element('result').textContent = '';
    showWorld(); element('status').textContent = 'Ready';
  } catch (error) { failure(error); }
  finally { controls(!session); }
}
element('profile').addEventListener('change', initialize);
element('run').addEventListener('click', async () => {
  element('output').textContent = ''; element('result').textContent = ''; element('status').textContent = 'Running';
  controls(true);
  try {
    active = session.run(element('source').value, {
      context: { this: moo.object(42), player: moo.object(7), caller: moo.object(7) },
      limits: { steps: 10_000_000 }, timeoutMs: 5000,
      onOutput(event) { element('output').textContent += `#${event.recipient.value}: ${event.text}\n`; },
    });
    controls(true);
    const result = await active.result;
    element('status').textContent = result.status;
    element('result').textContent = JSON.stringify({ status: result.status, commit: result.commit,
      ...(result.status === 'completed' ? { value: encodeValue(result.value, { profile: runtime.profile }) } : {}),
      diagnostics: result.diagnostics }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2);
  } catch (error) { failure(error); }
  finally { active = undefined; controls(false); showWorld(); }
});
element('stop').addEventListener('click', () => active?.stop());
for (const [id, action] of Object.entries({
  reset: () => session.reset(),
  save: () => { element('snapshot').value = session.save(); },
  load: () => session.load(element('snapshot').value),
})) element(id).addEventListener('click', () => {
  try { action(); showWorld(); element('status').textContent = id === 'reset' ? 'World reset' : id === 'save' ? 'Snapshot saved' : 'Snapshot loaded'; }
  catch (error) { failure(error); }
});
await initialize();
