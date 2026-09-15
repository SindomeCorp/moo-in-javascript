import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, moo, encodeValue, decodeValue } from '../dist/index.js';
import { createTeachingWorld } from '../dist/fixtures/index.js';

for (const profile of ['lambdamoo', 'toaststunt']) {
  test(profile + ': UTF-16 source positions survive CRLF, tabs, comments and verb calls', async () => {
    const runtime = await createRuntime({ profile });
    try {
      const source = '"😀 comment";\r\n\treturn 1 / 0;';
      const parsed = runtime.parser.parse(source);
      assert.equal(parsed.ok, true);
      const pending = [parsed.syntax];
      while (pending.length) {
        const node = pending.pop();
        const position = offset => {
          const prefix = source.slice(0, offset), lines = prefix.split('\n');
          return { offset, row: lines.length - 1, column: lines.at(-1).length };
        };
        assert.deepEqual(node.span.start, position(node.span.start.offset));
        assert.deepEqual(node.span.end, position(node.span.end.offset));
        if (!node.children.length) assert.equal(node.text, source.slice(node.span.start.offset, node.span.end.offset));
        pending.push(...node.children);
      }
      // Execution keeps the documented ASCII literal policy, including comment strings.
      const executable = source.replace("😀", "ab");
      const result = runtime.run(executable);
      assert.equal(result.status, 'runtime-error');
      assert.deepEqual(result.diagnostics[0].span, {
        start: { offset: source.indexOf('1 / 0'), row: 1, column: 8 },
        end: { offset: source.indexOf('1 / 0') + 5, row: 1, column: 13 },
      });
      const world = createTeachingWorld({ profile });
      world.addVerb(42n, { names: 'bad', owner: 7n, perms: 'rx', args: ['none','none','none'], source: executable });
      const call = 'return #42:bad();';
      const nested = runtime.run(call, { world });
      assert.equal(nested.status, 'runtime-error');
      assert.deepEqual(nested.diagnostics[0].span, result.diagnostics[0].span);
      assert.equal(nested.diagnostics[0].stack[0].verb, 'bad');
      assert.equal(nested.diagnostics[0].stack[0].definer, 42n);
      assert.equal(nested.diagnostics[0].stack[1].span.start.offset, 7);
      const rejected = runtime.compile('return "😀";');
      assert.equal(rejected.ok, false);
      assert.equal(rejected.diagnostics[0].category, 'unsupported-feature');
      assert.deepEqual(rejected.diagnostics[0].span, { start: { offset: 7, row: 0, column: 7 }, end: { offset: 11, row: 0, column: 11 } });
    } finally { runtime.dispose(); }
  });
  test(profile + ': host strings have explicit UTF-16 data semantics and ASCII case folding', async () => {
    const runtime = await createRuntime({ profile });
    try {
      const text = moo.string('A😀é\u0000Z');
      const context = { args: [text, moo.string('É'), moo.string('é')] };
      const result = runtime.run('s=args[1]; return {length(s),s[2],s[3],s[2..3],index(s,args[3]),args[2]==args[3],s[4..$]};', { context });
      assert.equal(result.status, 'completed');
      assert.deepEqual(result.value, moo.list([moo.int(6),moo.string('\ud83d'),moo.string('\ude00'),moo.string('😀'),moo.int(4),moo.int(0),moo.string('é\u0000Z')]));
      assert.deepEqual(decodeValue(JSON.parse(JSON.stringify(encodeValue(result.value, { profile }))), { profile }), result.value);
      const world = createTeachingWorld({ profile });
      world.setProperty(42n, 'lamp_on', text);
      const loaded = runtime.loadWorld(runtime.saveWorld(world));
      assert.deepEqual(loaded.getProperty(42n, 'lamp_on'), text);
      const output = runtime.run('player:tell(this.lamp_on);', { world: loaded, context: { this: moo.object(42), player: moo.object(7) } });
      assert.equal(output.output[0].text, text.value);
      assert.equal(output.statistics.outputCharacters, 6);
    } finally { runtime.dispose(); }
  });
}
