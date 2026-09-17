# moo-in-javascript

Embed MOO programs in Node.js and browser applications without running a MOO
server. MOO (MUD, Object Oriented) is a programming language built around objects,
properties, and methods called **verbs**, traditionally used in programmable
text-based worlds.

`@sindomecorp/moo-in-javascript` is an independent, educational interpreter for
explicit **LambdaMOO** and **ToastStunt** profiles. Use it for interactive coding
lessons, playgrounds, simulations, or applications that run MOO verb bodies against
an in-memory world. It is written in TypeScript and ships JavaScript ESM and type
declarations.

**Status:** pre-1.0, currently version 0.2.3. The documented subset includes
expressions, control flow, objects, source verbs, snapshots, and worker execution.
It is not a complete MOO server or a drop-in replacement for either upstream
implementation. See [compatibility](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/compatibility.md)
and the [builtin inventory](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/builtin-roadmap.md).

## Install

Requires **Node.js 22 or newer** for Node applications. Browser applications need
ES2022, WebAssembly, and module workers. Chromium 153 is covered by automated tests;
other browsers are not currently validated. Older Chromium has a known SQLite
worker limitation documented in the compatibility guide. The package is ESM-only.

```sh
npm install @sindomecorp/moo-in-javascript
```

This command becomes available after the initial npm publication. Until then,
follow [Contributing](https://github.com/SindomeCorp/moo-in-javascript/blob/main/CONTRIBUTING.md)
to build a checkout and use `npm pack` to create an installable tarball. npm
consumers receive compiled code and WASM assets; no compiler, submodules, or MOO
server is required.

## Node.js quick start

Save this as `example.mjs` and run `node example.mjs`:

```js
import { createRuntime, encodeValue } from '@sindomecorp/moo-in-javascript';

const runtime = await createRuntime({ profile: 'toaststunt' });
try {
  const result = runtime.run('return 1 + 2;');
  if (result.status === 'completed') {
    console.log(encodeValue(result.value, { profile: runtime.profile }));
    // { type: 'int', value: '3' }
  } else {
    console.error(result.status, result.diagnostics);
  }
} finally {
  runtime.dispose();
}
```

Always select `lambdamoo` or `toaststunt`; there is no default profile. Values are
tagged JavaScript objects. MOO integers use `bigint`, so use `encodeValue` for JSON
rather than directly stringifying runtime values. Syntax errors, unsupported
features, MOO errors, and execution limits are reported in results; invalid host
configuration and host failures can throw.

## Retain a world and run in a worker

A world holds objects, properties, and verb source. Reusing it preserves changes
between runs. This example uses a bundled teaching fixture; applications can
construct their own worlds with `createWorld`.

```js
import {
  createRuntime, createWorkerSession, moo,
} from '@sindomecorp/moo-in-javascript';
import { createTeachingWorld } from '@sindomecorp/moo-in-javascript/fixtures';
import { nodeWorkerFactory } from '@sindomecorp/moo-in-javascript/node-worker';

const runtime = await createRuntime({ profile: 'toaststunt' });
const world = createTeachingWorld({ profile: runtime.profile });
const session = createWorkerSession({ runtime, world, workerFactory: nodeWorkerFactory() });
try {
  const run = session.run('this.lamp_on = 1; player:tell("Ready."); return this.lamp_on;', {
    context: { this: moo.object(42), player: moo.object(7) },
    onOutput: event => console.log(event.text),
    timeoutMs: 5000,
  });
  // Call run.stop() to cancel an active run.
  const result = await run.result;
  console.log(result.status); // completed
  const saved = session.save(); // JSON snapshot, suitable for application storage
  session.reset();
  session.load(saved);
} finally {
  session.dispose();
  runtime.dispose();
}
```

Direct `runtime.run()` is synchronous. Use a worker for a responsive UI and hard
Stop/timeouts; `runAsync()` also supports bounded suspension but runs on the
calling thread. Ordinary MOO errors and controlled limits preserve preceding
world changes. Forced worker Stop/timeouts discard that run's changes; output
already delivered remains visible. Host side effects are not rolled back.

## Browser integration

The `/browser` and `/browser/fixtures` exports contain bundled ESM. The `/worker`
export is a module worker entry. Serve the package's `dist/` and `assets/`
directories together over HTTP, preserving their layout. For example, in an app
whose static files live in `public/`:

```sh
mkdir -p public/vendor/moo
cp -R node_modules/@sindomecorp/moo-in-javascript/dist node_modules/@sindomecorp/moo-in-javascript/assets public/vendor/moo/
```

Then use this module script in a page served by that app:

```html
<pre id="result"></pre>
<script type="module">
  import { createRuntime, createWorkerSession, encodeValue } from '/vendor/moo/dist/browser/index.js';
  import { createTeachingWorld } from '/vendor/moo/dist/browser/fixtures.js';

  const runtime = await createRuntime({ profile: 'toaststunt' });
  const session = createWorkerSession({
    runtime, world: createTeachingWorld({ profile: runtime.profile }),
  });
  try {
    const result = await session.run('return 6 * 7;').result;
    document.querySelector('#result').textContent = result.status === 'completed'
      ? JSON.stringify(encodeValue(result.value, { profile: runtime.profile }))
      : result.status;
  } finally {
    session.dispose();
    runtime.dispose();
  }
</script>
```

Adjust `/vendor/moo/` for your hosting base path. If a bundler relocates files,
explicitly supply `grammarWasm` and `runtimeWasm` URLs to `createRuntime`, and
`browserWorkerFactory(workerURL)` plus `parserOptions` to `createWorkerSession`.
Use the browser fixture export with the browser runtime so they share object
identity. See [worker integration](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/workers.md)
for these options. The repository also includes a runnable browser playground:
`npm run example:browser`, then open `http://127.0.0.1:4177/examples/browser/index.html`.

## How it works

1. Tree-sitter parses MOO source using the shipped grammar and WebAssembly runtime.
2. The compiler checks supported constructs and produces a runtime-owned program.
3. The interpreter executes against an in-memory world with explicit context and
   execution budgets, returning typed values, output events, changes, and diagnostics.
4. Sessions add JSON save/load and Reset. Worker sessions execute in a separate
   worker and validate returned world snapshots before committing state.

Use `runtime.compile()` and `runtime.execute()` when reusing a program within one
runtime. `runtime.run()` combines those steps. Snapshot persistence is application
controlled; the library does not provide a storage service.

Permissions, a full command dispatcher, background task scheduling, anonymous
objects, and WAIFs are not implemented. Some host builtins operate on a simulated
filesystem, connections, and services rather than operating-system resources.
Parsing successfully does not imply full upstream semantic compatibility. Consult
[host simulation](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/host-simulation.md)
and [semantics](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/semantics.md)
before integrating existing MOO code. Execution limits and workers do not implement
MOO permission enforcement.

## API and examples

| Topic | Guide |
| --- | --- |
| Runtime, values, diagnostics, async execution | [API](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/api.md) |
| Objects, properties, verbs, output | [Worlds](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/worlds.md) |
| Persistence and Reset | [Snapshots](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/snapshots.md) |
| Workers, Stop, timeouts, custom host verbs | [Workers](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/workers.md) |
| Builtin signatures and `function_info()` | [Introspection](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/builtin-introspection.md) |
| Build tools, assets, runnable examples | [Development](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/development.md) |

Run `npm run example:node` from a source checkout, or
`node node_modules/@sindomecorp/moo-in-javascript/examples/node.mjs` after installing
the package. The npm tarball includes both examples and detailed documentation.

## Test and contribute

```sh
git clone --recurse-submodules https://github.com/SindomeCorp/moo-in-javascript.git
cd moo-in-javascript
npm ci
npx playwright install chromium
```

| Command | Checks |
| --- | --- |
| `npm run typecheck` | Strict TypeScript checking |
| `npm test` | Build and Node unit/integration suite |
| `npm run test:coverage` | Node suite, coverage thresholds, and `coverage/lcov.info` |
| `npm run test:browser` | Chromium runtime, assets, and workers |
| `npm run test:package` | Fresh tarball installed into clean Node, TypeScript, and browser consumers |
| `npm run test:clean` | Fresh dependencies and build from current source inputs |
| `npm run test:checkout` | Full verification of committed HEAD in a fresh checkout |

CI checks Node 22 and 24, with Chromium and package checks on Node 22. Node coverage
must reach 95% lines, 90% branches, and 95% functions. These measurements cover
unbundled runtime JavaScript, including Node workers, and exclude generated assets
and duplicate browser bundles. Browser tests run separately. Corpus checks and
coverage are not claims of full server conformance.

Issues and pull requests are welcome. See
[Contributing](https://github.com/SindomeCorp/moo-in-javascript/blob/main/CONTRIBUTING.md)
for setup, bug reports, regression tests, and review expectations. Maintainers
use the [release guide](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/releasing.md)
for the initial npm publish and subsequent GitHub Release automation.

## License and upstream projects

[MIT](https://github.com/SindomeCorp/moo-in-javascript/blob/main/LICENSE).
[tree-sitter-moo](https://github.com/SindomeCorp/tree-sitter-moo) supplies the parser
grammar. [moo-for-llms](https://github.com/SindomeCorp/moo-for-llms) supplies
pinned development/test reference material; its corpus is not included in npm
artifacts. Packaged grammar and runtime license notices accompany the WASM assets.

This product includes software developed or owned by Caldera International, Inc.
See [third-party notices](https://github.com/SindomeCorp/moo-in-javascript/blob/main/docs/third-party-notices.md).
