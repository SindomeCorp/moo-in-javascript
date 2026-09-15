# v0.1 requirement audit

The scope is PLAN.md, including separate academy adoption. This audit keeps the
educational subset and its explicit unsupported features; it does not claim a
complete MOO server or every builtin.

| Requirement / milestone | Evidence |
| --- | --- |
| M0 package, ESM, declarations, licenses, exact dependencies | package.json/lockfile, tsconfig.json, scripts/assets.mjs, packed Node/TypeScript/browser consumers |
| Grammar/corpus pins, provenance, source rebuild | .gitmodules and gitlinks, assets/provenance.json, docs/grammar-rebuild.json, scripts/rebuild-grammar.mjs; byte-identical rebuilt WASM |
| Explicit profiles and semantic decisions | compatibility.md, semantics.md, values/runtime/string/text/float suites; manual and pinned source citations |
| M1 owned AST, expressions, immutable tagged values, maps | parser/compile.ts, values modules; parser, values and runtime tests including unreachable rejection |
| M2 flow, scatter/splice, catches/finally, uncaught budgets | evaluator.ts and budget.ts; runtime tests covering transfers, defaults, aliasing and resource limits |
| Worker output, actual termination, restart, no late commit/replay | worker modules; Node/browser Stop tests, timeouts, crashes, callback failures, output sequence checks |
| M3 objects, inheritance/pass, programming and six lessons | world/execution/builtins modules; world and academy tests in both profiles |
| M4 retained/fresh worlds, atomic snapshots and host IDs | snapshot/session modules; snapshots tests for malformed state, recompile, source edits, host failures and reset |
| Error/limit commit versus Stop/host failure | worker tests in both profiles, custom large-world transfer, direct/worker result bounds, negative-zero deltas |
| M5 reviewed corpus and package consumers | corpus manifest with hashes/metadata/static expectations; 28 executable and 3 unsupported profile cases; packed subpath consumer tests |
| Browser/Node examples, safely displayed output | examples/ and browser playground test; examples execute from installed tarball |
| M6 independent academy adoption | academy-integration.md; local tarball install, 6 app Node groups and 10 browser tests, actual output/state, alternate inputs, fresh runs |
| No server, no eval/new Function, no native addon required | owned AST evaluator, default registry, npm dependencies; isolated build and consumer tests |
| CI | .github/workflows/ci.yml installs pinned dependencies and runs unit/browser/package gates on Node 22; no remote CI run is claimed |
| Clean Git checkout | Final verification pending below |

Known boundaries are documented, not silent approximations: permission/task/server
facilities, waifs/anonymous objects, lifecycle hooks, full builtin coverage,
pinned grammar lexical gaps, printable-ASCII source strings and UTF-16 host-data
extensions. Floating/integer policies and profile-specific source quirks are
explicit. No local or remote MOO server or database dump is required.
