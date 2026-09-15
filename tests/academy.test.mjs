import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { createRuntime, moo } from '../dist/index.js';
import { createTeachingWorld } from '../dist/fixtures/index.js';

// Authored solutions and expectations reviewed from the six lesson challenges,
// not the interpreter. See docs/academy-evidence.md for provenance.
const scenarios = [
  { id: 'objects', source: 'player:tell("A workshop humming with possibility."); return;',
    output: ['A workshop humming with possibility.'], wrong: 'player:tell("A plain training room."); return;' },
  { id: 'properties', source: 'this.lamp_on=1; player:tell("The lamp clicks on."); return;',
    output: ['The lamp clicks on.'], property: ['lamp_on', 1n], wrong: 'this.lamp_on=0; player:tell("The lamp remains dark.");' },
  { id: 'args', source: 'player:tell("Color: ",args[1]); return;',
    output: ['Color: green'], args: [moo.string('green')], wrong: 'player:tell("Color: unknown");' },
  { id: 'branching', source: 'if(this.locked) player:tell("The door is locked."); else player:tell("You enter."); endif return;',
    output: ['The door is locked.'], wrong: 'player:tell("You enter.");' },
  { id: 'lists', source: 'tools={"wrench","probe","torch"}; for tool in(tools) player:tell(tool); endfor return;',
    output: ['wrench', 'probe', 'torch'], wrong: 'tools={"wrench","probe","torch"}; player:tell(tools);' },
  { id: 'errors', source: 'try value=this.missing_property; except(E_PROPNF) player:tell("That property does not exist."); endtry return;',
    output: ['That property does not exist.'], wrong: 'value=this.missing_property; player:tell(value);', error: 'E_PROPNF' },
];

for (const profile of ['lambdamoo', 'toaststunt']) {
  test(profile + ': all six academy solutions and failing alternatives execute', async () => {
    const runtime = await createRuntime({ profile });
    try {
      for (const scenario of scenarios) {
        const world = createTeachingWorld({ profile });
        const context = { this: moo.object(42), player: moo.object(7), caller: moo.object(7), args: scenario.args ?? [] };
        const result = runtime.run(scenario.source, { world, context, runId: scenario.id });
        assert.equal(result.status, 'completed', inspect(result.diagnostics));
        assert.deepEqual(result.value, moo.int(0), scenario.id);
        assert.deepEqual(result.output.map(event => event.text), scenario.output, scenario.id);
        assert.ok(result.output.every(event => event.recipient.value === 7n));
        if (scenario.property) assert.equal(world.getProperty(42n, scenario.property[0]).value, scenario.property[1]);
        const wrong = runtime.run(scenario.wrong, { world: createTeachingWorld({ profile }), context });
        if (scenario.error) {
          assert.equal(wrong.status, 'runtime-error'); assert.equal(wrong.diagnostics[0].code, scenario.error);
        } else {
          assert.equal(wrong.status, 'completed'); assert.notDeepEqual(wrong.output.map(event => event.text), scenario.output, scenario.id);
        }
      }
      const world = createTeachingWorld({ profile });
      world.setProperty(42n, 'locked', moo.int(0));
      const alternate = runtime.run(scenarios[3].source, { world, context: { this: moo.object(42), player: moo.object(7) } });
      assert.deepEqual(alternate.output.map(event => event.text), ['You enter.']);
    } finally { runtime.dispose(); }
  });
}
