# Current public API

The world/worker contracts are documented
in [contracts.md](contracts.md); see [compatibility.md](compatibility.md) for the
implemented surface and [semantics.md](semantics.md) for profile differences.

```js
import { createRuntime, moo, encodeValue } from '@sindomecorp/moo-in-javascript';
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
import { createTeachingWorld } from '@sindomecorp/moo-in-javascript/fixtures';
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

Use `@sindomecorp/moo-in-javascript/browser` with a bundler, or serve its bundled ESM file and
assets with the package directory structure intact. WASM URL overrides work under
subpaths. Use `createWorkerSession` for isolated execution, live output and Stop;
see [workers](workers.md). Synchronous `runtime.run()` has deterministic limits
and deliberately has no Stop control.

String search: `index(STR, STR [, ANY caseMatters])` and
`rindex(STR, STR [, ANY caseMatters])` return an INT position or zero.
ToastStunt accepts a fourth INT offset; see semantics.md for its direction and
relative-position behavior. These searches charge their comparison work.

## Builtin introspection

Use `listBuiltins({profile})` / `getBuiltinInfo(name, {profile})` without WASM, or
`runtime.listBuiltins()` / `runtime.getBuiltinInfo(name)`. MOO code can call
`function_info([name])`. See [builtin introspection](builtin-introspection.md)
for immutable signature/return metadata and the standard MOO description format.

## Expanded host support

`createHostEnvironment({connections?, fixtures?})` creates validated virtual host
state. Attach it with `world.setEnvironment(state)`; inspect `world.environment`.
See [host simulation](host-simulation.md) for persistence, fixtures and SQLite.
`limits.seconds` sets the whole-execution wall-clock budget (default 30 seconds).

### Bounded asynchronous suspension

`runtime.runAsync(source, options)` and `runtime.executeAsync(program, options)`
return promises. Worker sessions use the same resumable evaluator. In these
executions, `suspend(seconds)` pauses without blocking the caller's event loop,
then returns `0`. Nonnegative delays are clamped to five seconds per call;
ToastStunt accepts fractional seconds and LambdaMOO accepts integers. An explicit
argument is required. `suspend(0)` yields to the event loop without a requested delay.

Resumption replenishes the configured tick and seconds allowances; statistics,
allocation and output budgets remain cumulative. At most 100 suspensions are
allowed per run. Worker timeouts remain absolute and must allow enough time for
the requested waits; Stop terminates the worker and discards its uncommitted
world. Direct async executions retain ordinary direct-run commit behavior.

Synchronous `run`/`execute` reject a reached `suspend` with `E_INVARG` rather than
blocking. No `resume`, indefinite wait, background-task queue or multi-task MOO
scheduler is implemented. Suspension resumes the existing stack and local values;
it does not replay code. Concurrent executions on one world remain rejected.

### Retaining source from a larger core

`runtime.loadWorld(snapshot, {unsupportedSourcePolicy: 'retain'})` preserves verbs
whose source is valid MOO syntax but uses an unsupported language feature, such
as `fork`. The default remains `reject`; malformed syntax is rejected in both
modes. This option is intended for imported source libraries and inspection.

Pass the same option to `createWorkerSession({runtime, world,
unsupportedSourcePolicy: 'retain'})` when executing such a world. Invoking a
retained unsupported verb reports `unsupported-feature` and discards that run's
changes. Retention does not implement missing builtins, permissions or scheduling.

ToastStunt source supports conditional argument splicing, one- and two-variable
list/string/map iteration (value, then index or key), and the `ANON`/`WAIF` type
constants for inspection. These constants do not add anonymous objects or waifs.
The error constants `E_FILE`, `E_EXEC` and `E_INTRPT` retain native numeric values
16–18 and are available only in the ToastStunt profile.

### Reusing a worker

`createWorkerSession({runtime, world, reuseWorker: true})` keeps one worker alive
between completed runs. The default still terminates the worker after every run.
Call `session.warmup()` to load its parser and validate the initial world in the
background without executing code; an immediate run queues behind initialization.
Call `session.dispose()` when leaving the workspace. Disposal cancels an active
run and releases the worker; a disposed session cannot run again.

Each run uses the latest caller-provided world. The worker retains only its latest
world and a runtime-local, bounded cache of source compilations. A different
snapshot, source text, profile or load policy invalidates the relevant cached
state. Task locals and execution budgets start fresh on every run. Stop, timeout
and transport failures terminate the worker, discard the uncommitted state, and
force the next run to initialize a fresh worker from the committed world.

Reuse trades higher idle memory usage for lower repeated-run latency. An unchanged
returned snapshot avoids redundant decoding and world replacement; its result has
no changes. Applications may skip persistence for such a result, provided their
existing pending saves are handled separately.
