# Compatibility and implementation status

This package implements the documented educational subset. `createParser()` and `createRuntime()` are
available. Expression/control-flow execution, worlds, source verbs and output
work. Snapshots, host registrations, Reset, browser/Node execution workers
and Stop are implemented. Parsing a
construct does **not** claim execution support. Historical scope and milestones remain in [PLAN.md](https://github.com/SindomeCorp/moo-in-javascript/blob/main/PLAN.md).

| Feature | LambdaMOO parser | ToastStunt parser | Execution |
| --- | --- | --- | --- |
| Expressions, variables, lists, indexing and slices | Accepted | Accepted | Implemented |
| If/while/for, break/continue/return | Accepted | Accepted | Implemented |
| Scatter, splicing, catches, finally | Accepted | Accepted | Implemented |
| Map literals and basic map builtins | Rejected before execution | Accepted | ToastStunt implemented |
| Properties, verb calls and pass | Accepted | Accepted | Implemented |
| Fork | Explicit unsupported diagnostic | Explicit unsupported diagnostic | Deferred |
| Invalid/missing/unterminated syntax | Syntax diagnostic | Syntax diagnostic | Never executable |
| Inheritance and object programming | Not a parser feature | Not a parser feature | Implemented with documented limitations |
| Snapshots, host registrations and Reset | Not a parser feature | Not a parser feature | Implemented |
| Execution workers and Stop | Not a parser feature | Not a parser feature | Implemented |

Profiles are mandatory. No implicit profile or automatic profile conversion is
allowed. General permission enforcement, command dispatch, cooperative scheduling,
WAIFs and anonymous objects remain unsupported. Movement and single-parent
reparenting are implemented. Connections and database checkpoints use the
[persistent educational host](host-simulation.md). The
[builtin inventory](builtin-roadmap.md) distinguishes real implementations,
limited subsets, simulations and deferred features.

## References

- [LambdaMOO Programmer's Manual](https://lambda.moo.mud.org/pub/MOO/ProgrammersManual.html),
  retrieved 2026-09-15. The live document is unversioned; its text is the initial
  language reference, not a claim of compatibility with every LambdaMOO build.
- [ToastStunt reference revision aecc51e9449c6e7c95272f0f044b5ba38948459e](https://github.com/lisdude/toaststunt/tree/aecc51e9449c6e7c95272f0f044b5ba38948459e),
  inspected statically from an existing local checkout. No server has been run.
- Grammar 0.2.16, revision `5e42672ffa1a4e955fe6a04da534396282522242`.
- Development corpus revision `d7d75840ec829157498cfc524df8794136723830`.

The grammar accepts extensions and has lexical differences from the manual.
For example, the manual permits `325.` and `.0325` float spellings while this
grammar's float token does not. Such gaps must remain explicit until corrected
in a reviewed grammar update; successful parsing is not semantic evidence.

## Validation evidence

`npm test` tests real packaged grammar parsing in Node, including missing nodes,
ERROR nodes, unterminated strings, profile validation, source fields, disposal,
and a complete 447-file upstream grammar syntax baseline. That baseline contains
434 accepted parses and 13 explicit fork rejections. It does not evaluate corpus
programs or provide an execution oracle. Separate runtime tests cover typed
values, operators, flow, exceptions, maps, aliases and limits. Their reviewed
expectations cite the manual and the pinned source's `numbers.cc`, `utils.cc`,
`map.cc`, `collection.cc`, `list.cc`, and `unparse.cc`. See
[semantics](semantics.md) for explicit differences and boundary evidence.

## Deliberate exclusions and accounting stubs

Multiple inheritance (`chparents` and multi-parent creation), native multithreading
(`threads`, `thread_pool`, `set_thread_mode`), and native bytecode facilities
(including `disassemble`) are out of scope, not deferred compatibility targets.
Single-parent inheritance remains the supported object model. A future cooperative
scheduler would not introduce multithreading.

`value_bytes` and `object_bytes` are documented fixed-zero stubs in both profiles,
not memory measurements. See [builtin introspection](builtin-introspection.md#memory-accounting-stubs)
for argument validation and [the roadmap](builtin-roadmap.md) for the remaining inventory.

Bounded `suspend(seconds)` is available through async executions and workers.
It caps waits at five seconds and refreshes this evaluator's configured tick/time
slice, not native foreground/background server quotas. There is no indefinite
suspension or `resume()`; output/allocation limits and worker watchdogs remain in
force. See the asynchronous suspension section in `api.md`.

## Browser validation

The browser runtime and workers are validated with Chromium 153 through pinned
Playwright 1.63.0. Other browser engines and older Chromium versions are not
currently validated as a complete supported target. In Chromium 141, basic
runtime and worker tests pass, but the bundled SQLite engine can return
`Maximum call stack size exceeded` inside a worker. Use the validated browser
version when depending on SQLite persistence; ES2022 and WebAssembly support
alone do not guarantee every builtin works in an older browser.
