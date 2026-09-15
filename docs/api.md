# Current public API

The v0.1 world/worker contracts are documented
in [contracts.md](contracts.md); see [compatibility.md](compatibility.md) for the
implemented surface and [semantics.md](semantics.md) for profile differences.

```js
import { createRuntime, moo, encodeValue } from 'moo-in-javascript';
const runtime = await createRuntime({ profile: 'toaststunt' });
try {
  const compilation = runtime.compile('return args[1] + 2;');
  if (compilation.ok) {
    const result = runtime.execute(compilation.program, {
      context: { args: [moo.int(5)] },
      limits: { steps: 100_000, allocations: 1_000_000, evaluationDepth: 200 },
    });
    if (result.status === 'completed') {
      console.log(encodeValue(result.value, { profile: 'toaststunt' }));
      // { type: 'int', value: '7' }
    }
  }
} finally {
  runtime.dispose();
}
```

`run(source, options)` combines compilation and execution. Compile failures report
syntax-error or unsupported-feature and execute no statements. MOO errors return
runtime-error with a code/message/span. Controlled limits return limit-exceeded;
they cannot be caught by MOO code. Host/configuration errors throw outside the
result channel. Program handles belong to one runtime and are not serializable.
Each invocation gets fresh locals. Pass the same World to retain properties,
objects and verb source across runs. See [worlds](worlds.md) for the object API.

All MOO values use immutable tagged constructors: `moo.int`, `moo.float`,
`moo.string`, `moo.object`, `moo.error`, `moo.list`, `moo.map`. Use BigInt when an
integer exceeds JavaScript's safe integer range. `encodeValue`/`decodeValue` use
the required profile and bounded JSON-safe encoding; do not JSON.stringify raw
BigInt values. Constructors isolate host array aliases; maps canonicalize scalar
keys and reject collection keys.

## Implemented host builtins

| Name | Signature |
| --- | --- |
| length | `(string/list/map)` |
| typeof | `(value)` |
| equal | `(value, value)` — case-sensitive equality |
| tostr | `(...values)` — concatenate display forms |
| toliteral | `(value)` — MOO literal form |
| raise | `(error [, string message [, value]])` |
| mapkeys | `(map)` — ToastStunt only |
| mapvalues | `(map [, key, ...])` — requested keys are case-sensitive |
| maphaskey | `(map, scalar key [, int case_matters])` |
| mapdelete | `(map, scalar key or list of keys)` — returns a new map |

Unknown/unimplemented host builtin calls produce explicit E_INVARG diagnostics.
World properties, verbs, pass and the programming/inspection APIs listed in
[worlds](worlds.md) are implemented. Output events and before/after world changes
are returned, including allocation-state changes when object IDs advance.

```js
import { createTeachingWorld } from 'moo-in-javascript/fixtures';
const world = createTeachingWorld({ profile: 'toaststunt' });
const result = runtime.run('this.lamp_on = 1; player:tell("Ready.");', {
  world,
  context: { this: moo.object(42), player: moo.object(7) },
  onOutput: event => console.log(event.text),
});
```

Use this example before disposing runtime. New worlds give fresh attempts;
retaining world gives retained sessions. Snapshot-based save/load and Reset are
documented in [snapshots](snapshots.md). Output callbacks are host capabilities; their failures throw
HostError rather than catchable MOO errors.

## Browser

Use `moo-in-javascript/browser` with a bundler, or serve its bundled ESM file and
assets with the package directory structure intact. WASM URL overrides work under
subpaths. Use `createWorkerSession` for isolated execution, live output and Stop;
see [workers](workers.md). Synchronous `runtime.run()` has deterministic limits
and deliberately has no Stop control.

String search: `index(STR, STR [, ANY caseMatters])` and
`rindex(STR, STR [, ANY caseMatters])` return an INT position or zero.
ToastStunt accepts a fourth INT offset; see semantics.md for its direction and
relative-position behavior. These searches charge their comparison work.
