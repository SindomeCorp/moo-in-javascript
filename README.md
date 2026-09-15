# moo-in-javascript

A standalone JavaScript interpreter for a documented subset of MOO,
usable from Node.js and browsers. It executes verb bodies against a small
in-memory world and return real values, output, state changes, and diagnostics.

**Status:** v0.1 implemented. Expressions, collections, control flow,
scatter and error handling execute with typed results and deterministic limits.
Retained worlds, inherited verb calls, object programming and live output work.
Versioned JSON snapshots, atomic load, Reset and host verb registrations work.
Browser/Node workers support live output, Stop, timeouts and transactional commits.
Reviewed corpus execution and separate academy integration are validated.
This repository is independent of `~/moo-academy`. Implementation uses
TypeScript compiled to JavaScript ESM, with type declarations for consumers.

See [PLAN.md](PLAN.md) for scope, architecture, dependencies, milestones, testing,
and the package integration contract.

See [development](docs/development.md), [compatibility](docs/compatibility.md),
and [implementation progress](docs/progress.md) for validation evidence.
See [worlds](docs/worlds.md) for object APIs and output contracts.
See [snapshots](docs/snapshots.md) for save/load, sessions and host registrations.
See [workers](docs/workers.md) for isolated execution, Stop and commit behavior.
See [corpus evidence](docs/corpus.md) for independently reviewed execution cases.

```js
import { createRuntime } from 'moo-in-javascript';
const runtime = await createRuntime({ profile: 'toaststunt' });
try {
  console.log(runtime.run('return 1 + 2;'));
} finally {
  runtime.dispose();
}
```

## Supported scope

Support explicit LambdaMOO and ToastStunt profiles, broad beginner syntax,
ToastStunt maps, inherited/programmatically editable objects, persistent worlds,
and JSON snapshots. Provide live output and Stop through a browser Worker, with
Node.js support and no required MOO server. Profile selection is explicit.

Ordinary runtime errors and controlled limits preserve prior world changes.
Forced Stop discards that run's changes; output already delivered remains visible.
Snapshots save world data, MOO source, and profile, without editor/session state.

All six academy lessons are an early integration check, not the whole scope.
Normal tests use reviewed expectations; optional development checks can use the
user's existing dev MOO through MCP. Permissions are deliberately not enforced.

## Upstream projects

- [tree-sitter-moo](https://github.com/SindomeCorp/tree-sitter-moo): grammar and WASM parser.
- [moo-for-llms](https://github.com/SindomeCorp/moo-for-llms): development/test corpus and reference material.

The corpus is a development dependency; it will not be shipped to browsers.
Dependency revisions and provenance requirements are specified in the plan.

## License

[MIT](LICENSE). Upstream dependency notices will be retained with packaged assets.
