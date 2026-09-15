# Implementation plan: moo-in-javascript

## Confirmed requirements

- Two compatibility profiles: LambdaMOO and ToastStunt. Selection is required;
  there is no implicit default, and snapshots preserve the selected profile.
- Broad beginner language support, including scatter assignment, splicing,
  inline error catching, and `finally`.
- Single-parent inheritance, `pass()`, and familiar MOO APIs for creating,
  programming, inspecting, and deleting objects, properties, and verbs.
- ToastStunt maps and basic map operations; defer waifs and anonymous objects.
- Trusted worlds without permission enforcement.
- Retained session worlds, explicit reset, and versioned JSON save/load.
- Live output, final results, and a Stop control; no debugger stepping initially.
- Keep world changes on ordinary MOO runtime errors and controlled execution
  limits (steps, call depth, allocations, output). Discard a run's world changes
  on forced Stop or hard worker timeout; retain output already delivered.
- Snapshots contain world data, MOO verb source, and compatibility profile.
  They exclude editor/history data and session invocation context. Recompile
  saved source on load; the host supplies built-ins.
- The library and ordinary tests require no MOO server. Documentation, source
  inspection, and reviewed expectations are the default validation strategy.
  Optional development checks may use the user's existing dev MOO via MCP.
  No local LambdaMOO/ToastStunt server setup is required or planned.

- Implementation: TypeScript source compiled to JavaScript ESM, with public
  TypeScript declarations. JavaScript consumers need no TypeScript toolchain.
- License: MIT, preserving dependency license notices separately.

Product scope decisions are complete. M0 resolves technical details within this
scope. Identify the dev MCP connection when needed; no matching MOO tool was
exposed during this planning session's tool discovery.

## 1. Objective and boundaries

Build an independent JavaScript library that parses and executes a documented
subset of MOO. Consumers provide a fixture world and invocation context, then
receive structured results suitable for an editor, test harness, or other UI.

An early integration milestone is to execute the six MOO Field Manual lessons in
`~/moo-academy/moo-field-manual`, including output, property changes, branching,
list iteration, arguments, and caught errors. Integration with that app follows
a working, tested standalone package; this plan does not change academy code.
The six lessons are a minimum check, not the full v0.1 acceptance scope.

The first release is an educational interpreter, not a compatible MOO server.
Do not implement database dump import, networking, connections, command dispatch,
permission enforcement, task scheduling, or the complete built-in library.
Versioned JSON world persistence is required.
Do not silently approximate unsupported language features.

## 2. Dependency and reproducibility strategy

### Grammar: execution dependency

Use the browser-capable WASM supplied by `tree-sitter-moo` and the
`web-tree-sitter` runtime. Reuse the same parser backend in Node and browsers.
Do not require a native Node addon for consumers.

Initial known working pair from academy:

- Repository: https://github.com/SindomeCorp/tree-sitter-moo
- Revision: `5e42672ffa1a4e955fe6a04da534396282522242`
- Grammar package version at that revision: `0.2.16`
- Runtime: `web-tree-sitter` `0.25.10`

Use a pinned Git submodule at `vendor/tree-sitter-moo` as the initial upstream
source dependency. Copy its WASM into package assets during build; record the
upstream revision and SHA-256 and preserve its MIT license. Pin the npm runtime
exactly in package.json and commit the lockfile. A future registry dependency
may replace the submodule after package artifact equivalence is verified.

Ordinary consumers install the built package; they do not clone the grammar or
install Emscripten. Contributor documentation must explain both asset copying
and rebuilding the grammar from source using pinned tooling.

### Corpus: development dependency

- Repository: https://github.com/SindomeCorp/moo-for-llms
- Initial revision: `d7d75840ec829157498cfc524df8794136723830`
- Pinned Git submodule: `vendor/moo-for-llms`

Read fixtures directly from this checkout or generate a curated fixture export
with provenance. Retain source path, revision, license, dialect, and original
metadata. Do not bundle the full corpus, credentials, evaluation data, or vendor
checkouts into the npm package.

Use examples as test inputs and reference material, not as an authority for
language semantics or an executable oracle. Keep held-out evaluations out of
ordinary fixture generation. Do not execute upstream scripts automatically.

The corpus includes `docs/runtime-smoke-manifest.json`, which offers initial
execution candidates. Its substring checks must be strengthened into exact
expected MOO values, output, and errors for this project's fixtures.

Upgrades to either upstream require explicit revision changes, regenerated
provenance, tests, and a recorded compatibility impact.

## 3. Compatibility contract

Before implementing operators, write `docs/semantics.md` and
`docs/compatibility.md`. Define explicit LambdaMOO and ToastStunt profiles and
record exact reference versions used for documentation and source inspection.
Shared operations and profile differences need distinct test coverage. The
ToastStunt profile supports maps; the LambdaMOO profile rejects them before
execution. Neither profile claims permission enforcement or full server support.
The grammar accepts more syntax than either execution profile will support.

Resolve and test these choices explicitly:

- Integer width, overflow, integer division, mixed int/float operations.
- Floating-point exceptions, truth values, equality, membership, short-circuiting.
- String comparison/case behavior, escaping, indexing, and character model.
- One-based list/string indexing, inclusive slices, and out-of-range behavior.
- Lists have value semantics; assignment and argument passing must not expose
  accidental JavaScript array aliasing.
- Variable naming/case, uninitialized reads, and verb-local scope.
- Error values versus raised runtime errors; explicit return and fall-through.
- Call context: receiver (`this`), player, caller, verb, and args.
- Missing object/property/verb handling, single-parent inheritance, and `pass()`.
- Map key comparison, ordering, indexing, mutation, and serialization in ToastStunt.

Use tagged values internally: int, float, string, list, object, error, map. Do not
conflate `#7`, integer `7`, and float `7.0`. Define a JSON-safe codec; if integers
use BigInt internally, browser messages and serialized results still need a
lossless encoding. No JavaScript implicit coercion in MOO operators.

Publish unsupported features and intentional differences. Report unsupported
syntax before execution, even when it appears in an unreachable branch. Unknown
calls resolved dynamically produce explicit runtime diagnostics. Distinguish
missing world verbs from host built-ins deliberately omitted by this runtime.

Authoritative references:

- https://lambda.moo.mud.org/pub/MOO/ProgrammersManual.html
- https://github.com/lisdude/toaststunt (pin a reference revision for static source inspection during implementation)
- Upstream grammar and corpus docs provide supporting implementation context.

## 4. Architecture

Use TypeScript source with strict type checking, compiled to JavaScript ESM and
public declaration files. Model MOO values, AST nodes, results and worker messages
as discriminated unions; consumers may use JavaScript or TypeScript.
Keep one package initially, with clear internal modules and optional entry points.

```text
src/
  parser/       Tree-sitter loading, diagnostics, syntax-tree-to-AST conversion
  ast/          Owned AST node definitions and source spans
  values/       Tagged MOO values, operators, conversion, serialization
  runtime/      Evaluator, call frames, flow control, errors, execution budgets
  world/        Object lifecycle, inheritance, properties, verb lookup
  snapshots/    Versioned world JSON, validation, loading, and source recompilation
  builtins/     Explicit host function registry and small standard implementation
  fixtures/     Optional teaching-world factory and output verbs
  worker/       Browser message protocol, cancellation, serialization
  index.ts      Environment-independent public exports
assets/         Packaged grammar/runtime assets and provenance
scripts/        Build, dependency asset checks, corpus manifest generation
tests/         Unit, conformance, corpus, integration, browser, package tests
docs/          Semantics, support matrix, API, embedding, provenance
```

The parser produces an owned AST, preserving source positions, then deletes its
Tree-sitter trees. Unsupported nodes cannot disappear during conversion.
The evaluator walks this AST. No bytecode compiler is needed initially; a later
backend can consume the same AST without changing the public result contract.

Keep the runtime free of DOM, academy lesson IDs, localStorage, and presentation
code. The fixture world is optional and never hardcoded into variable lookup.

### World and calls

An object has an ID, explicit properties, and named verbs. A verb may be MOO
source compiled to our AST or a registered host implementation. Support actual
nested MOO verb calls and independent frames; do not special-case every call to
`player:tell` in the evaluator.

Provide a minimal teaching player (#7) and room (#42). Predeclare properties
used by lessons. Writes to missing properties should not implicitly create them.
Support persistent worlds with explicit reset and optional fresh fixtures per
run. Implement single-parent inheritance and `pass()`; distinguish receiver from
the ancestor containing the verb definition. Bound and validate parent traversal.

Implement `create()`, `add_property()`, `add_verb()`, and `set_verb_code()`, plus
deleting properties/verbs, object recycling, and inspecting definitions through
familiar MOO APIs. Enumerate exact supported function names/signatures in M0.
Support computed property/verb names needed by generic inspection/editing code.
Do not bypass arity/type validation just because permissions are omitted.

Document ownership and permission-flag metadata as accepted/returned data without
enforcement. `set_verb_code()` validates source using the world's profile and
must not replace working code on failed compilation. Specify and test inherited
property overrides, inherited verb lookup, deletion behavior, and recycling
references/children from reference semantics. Unsupported lifecycle hooks must
be explicit. Parent changes and movement APIs are deferred; this does not excuse
inconsistent parent relationships when creating or recycling objects.

`notify(player, message)` is a host built-in that emits an output event.
`:tell(...)` and optional `:notify(...)` are fixture verbs. Their supported
conversion behavior is documented; they do not claim to implement LambdaCore.
Where practical, implement the fixture verbs as MOO source over minimal built-ins.

Output events include run ID, sequence number, recipient, and text. Consumers
render them as text. Host output delivery errors are infrastructure failures.
World properties are MOO values, never arbitrary objects with host prototypes.

## 5. Initial executable language surface

Required for v0.1:

- Literals, durable string comments, variables, assignment, parentheses.
- Arithmetic, comparisons, logical operators, unary expressions, membership.
- Lists, indexing, useful slice operations, list/string conversion support.
- Property access and assignment on fixture objects.
- `if`/`elseif`/`else`, `for` over lists and numeric ranges, `while`.
- `break`, `continue`, and `return` with correct flow propagation.
- Explicit verb calls with local arguments and nested call frames.
- Error constants and raised errors; `try`/`except`, `finally`, inline catches, and `raise`.
- Scatter assignment, list/argument splicing, and computed property/verb names.
- Single-parent inheritance, `pass()`, and object programming/inspection/deletion.
- ToastStunt maps and their basic operations under the ToastStunt profile.
- Minimal built-ins driven by tests: `notify`, `tostr`, `toliteral`, `typeof`,
  `length`, `valid`, and `raise`; add others only with concrete coverage needs.

Defer command parsing/spec matching, `fork`, suspension, task APIs, permission
enforcement, database dump import, parent-changing and movement APIs, waifs,
anonymous objects, and the remaining dialect-specific built-in catalog.
Track omissions explicitly rather than supplying placeholder results.

## 6. Proposed public API (design, not implemented)

```js
import { createRuntime, moo } from 'moo-in-javascript';
import { createTeachingWorld } from 'moo-in-javascript/fixtures';

const runtime = await createRuntime({
  profile: 'toaststunt', // Required: 'toaststunt' or 'lambdamoo'.
  // Optional WASM URLs or bytes.
});
const compilation = runtime.compile(source);

if (compilation.ok) {
  const result = runtime.execute(compilation.program, {
    world: createTeachingWorld({ profile: 'toaststunt' }),
    context: {
      player: moo.object(7),
      this: moo.object(42),
      caller: moo.object(7),
      args: [],
    },
    onOutput: event => console.log(event.text),
    limits: {
      steps: 100_000,
      callDepth: 50,
      outputCharacters: 20_000,
      // Also bound collection/string allocations and accumulated output events.
    },
  });
}
```

Also offer `run(source, options)` as a compile-and-execute convenience and an
explicit `dispose()` for parser resources. Program handles belong to a runtime and profile;
do not promise stable serialization of compiled programs in v0.1. World creation
requires a profile. Reject mismatches between a world, runtime and program before
execution. Snapshot loading uses its saved profile and must not silently convert
it to a consumer's preferred profile.

Execution results contain:

- Status: completed, syntax-error, unsupported-feature, runtime-error,
  limit-exceeded, or cancelled.
- Tagged return value on completion.
- Output events emitted up to termination.
- World changes: object lifecycle, properties, verb definitions/source, and metadata.
- Whether changes were committed, discarded, or unavailable after host failure.
- Structured diagnostics: category, MOO error code when applicable, source span,
  verb call stack, and a readable message.
- Execution statistics sufficient to diagnose limits.

Retain world changes that precede an ordinary MOO runtime failure or a controlled
execution-limit termination. Forced Stop or hard worker timeout discards changes
from that run; previously delivered output remains visible. Compile failures
execute nothing. A consumer wanting isolated attempts creates a new world per run.

| End condition | World state | Delivered output |
| --- | --- | --- |
| Successful completion | Commit changes | Retain |
| Ordinary MOO runtime error | Commit prior changes | Retain |
| Controlled step/depth/allocation/output limit | Commit prior changes | Retain |
| Forced Stop or hard worker timeout | Discard this run's changes | Retain |
| Syntax/profile/unsupported-feature rejection | Unchanged | No program output |
| Host crash or infrastructure failure | Do not commit incomplete worker state | Retain |

The triggering operation must not leave partially applied mutations. Budget checks
must permit a structured terminal result and state transfer, with bounded world
sizes and reserved capacity for reporting. A native crash or hard timeout is a host
failure/forced termination, not a controlled limit with recoverable state. Do not
claim retained changes if the worker could not deliver its terminal result.

Provide versioned `saveWorld()` / `loadWorld()` APIs (names provisional). Snapshots
contain IDs and next-ID allocation state, parent relationships, property values
and metadata, verb definitions and MOO source, and compatibility profile. Encode
all MOO values losslessly, including object references, errors, maps and integers.
Do not serialize native functions, ASTs, live parser nodes, sessions, or UI data.

Validate snapshot schema, limits, IDs, references and inheritance before replacing
a world. Recompile stored verb source under the stored profile. Loading is atomic;
a failure leaves the existing world untouched. Host-provided fixture verbs require
stable registered identifiers and clear diagnostics for unavailable registrations.
No arbitrary JavaScript can be deserialized. Missing profiles or incompatible
snapshot versions fail explicitly rather than silently changing semantics.

Host configuration/infrastructure failures have a separate API error channel;
do not disguise parser initialization failures or host implementation bugs as
MOO runtime errors that lesson code can catch.

## 7. Execution boundaries and browser use

Do not translate user code into JavaScript for `eval` or `new Function`.
Only registered built-ins/verbs may reach host capabilities. Discard-on-Stop
covers managed world state, not arbitrary external side effects from custom host
callbacks. Default host hooks expose output only; document this boundary for
embedders registering additional capabilities. No filesystem,
network, DOM, or arbitrary object access is exposed by default.

Enforce deterministic step and call-depth budgets. Account for large host
operations, string/list allocations, and output growth; counting AST nodes alone
is insufficient. Resource-limit termination must not be catchable and resettable
inside an infinite MOO loop.

Browser consumers run evaluations in a dedicated Web Worker. The main thread
can terminate a worker on timeout/cancellation even if the evaluator is stuck.
A synchronous evaluator cannot receive a cancellation message while busy; use
worker termination rather than pretending an AbortSignal interrupts it.
Apply the same isolation strategy in Node when strong cancellation is needed.

Separate worker entry point, request IDs, serialization, cancellation and restart
behavior from the core evaluator. Execution uses a serialized world snapshot and
returns changes; never accidentally mutate the UI's world before completion.
Use a working world snapshot per execution. Stream output immediately, but commit
world changes only on the selected completion statuses. A terminated worker
cannot supply its final state; discard its working snapshot and restart from the
last committed world. Snapshot save/load/reset operations occur between runs;
serialize execution per world initially to avoid conflicting commits.

Return a cancellation handle from the worker adapter. Implement a minimal worker
round trip early, then live output and forced termination as execution lands.
Batch output events when necessary without changing order or defeating limits.
Already delivered messages remain visible after Stop and are never replayed as
new messages on restart. Document that buffered messages can be lost on hard Stop.
The host must ignore late messages from cancelled or replaced run IDs.

## 8. Tests and validation

### Focused correctness tests

Table-driven tests for value semantics, every operator, short-circuiting,
index/slice boundaries, float/int distinctions, errors and source locations.
Cover list aliasing, nested returns, loops with break/continue, except matching,
call context restoration, missing properties/verbs, and output recipient routing.

Parser tests must exercise the shipped WASM, ERROR nodes, missing nodes, and the
grammar's explicit `unterminated_string` nodes. Invalid syntax and unsupported
features cannot execute partial programs.

### Corpus tests

Maintain a reviewed manifest of corpus paths, required features, invocation
arguments, fixture worlds, exact expected values/output/changes/errors, and
provenance. Do not derive expected answers by running this interpreter itself.
Use documentation and static source analysis to establish manually reviewed
expectations. Never generate expected results from this interpreter itself.

Report parsed, executable, intentionally unsupported, and failing cases
separately. Make newly supported cases part of the required execution suite.
Explicit unsupported cases should test their diagnostic rather than silently skip.

The existing academy parsed 447 grammar fixtures. That is a syntax regression
baseline, not evidence that those examples can execute in our minimal world.

### Conformance checks and optional dev-MOO evidence

Ordinary development, CI, package installation, and execution remain independent
of any MOO server. Do not provision local LambdaMOO/ToastStunt instances.

Maintain citations and reviewed expectations for each supported semantic rule.
Inspect pinned reference source where manuals are unclear. Exercise both profiles
with explicit dialect cases. Combine focused cases, boundaries, metamorphic tests,
and corpus fixtures; internal consistency alone is not proof of compatibility.

The user permits optional development checks through an available MCP connector
to their existing dev MOO. Discover and inspect its tools when needed; do not
invent a connection or assume the connector is exposed in every session. Prefer
isolated expressions and dedicated scratch objects for necessary mutation tests.
Record server version/configuration, input, output, and observed effects with any
result used as evidence. A ToastStunt observation alone does not validate a
LambdaMOO-specific rule. Keep live checks separate from the default test suite,
retain reviewed fixtures offline, and do not introduce a mandatory live dependency.

### Integration and packaging

- Execute all six academy lesson solutions and meaningful failing alternatives.
- Assert real values/output/state, not only that execution did not throw.
- Browser tests: packaged WASM loading, worker messages, infinite loops,
  cancellation, parser failure, output limits, and safely rendered diagnostics.
- Two runtimes/worlds must not leak state into each other.
- Both profiles: shared cases and differing semantics; ToastStunt map coverage.
- Inheritance, `pass()`, object creation/recycling, verb programming, and failed
  recompilation preserving previous code.
- Snapshot round trips after creation/deletion, maps and nested values; source
  recompilation; malformed/oversized snapshots; missing host registrations.
- Ordinary errors and controlled limits commit prior changes; Stop discards run changes and preserves
  delivered output. Retained sessions, explicit Reset, and fresh-world mode work.
- Cancellation cannot commit late results or duplicate streamed output.
- `npm pack` then install the tarball in clean Node and browser fixture consumers.
- Verify exported declarations, worker entry point, assets, licenses and absence
  of vendor checkouts, development data, and unintended host dependencies.
- Serve a plain static browser example; verify WASM URL overrides for hosts
  without a bundler, including hosting under a subpath.

Initial tooling: Node's built-in test runner, Playwright browser tests, npm lockfile,
ESM builds and declaration generation. Pin tooling during scaffolding and document
supported Node/browser versions. CI runs unit, corpus subset, browser and packed
consumer tests. Avoid benchmark work until correctness and a real need exist.

## 9. Milestones and exit criteria

### M0 — Package foundation and semantic decisions

Create metadata, TypeScript build/type checks, pinned dependencies, provenance,
MIT license packaging, and CI.
Define both semantic profiles, supported API signatures, snapshot schema, result
contracts and reference citations. Scaffold an early browser Worker round trip.

Exit: clean checkout loads the grammar in Node and browser, selects a profile,
and communicates with a worker. No interpreter claims yet.

### M1 — Expressions and owned AST

Implement parser diagnostics, profile-aware AST conversion, tagged values,
variables, operators, lists/slices, returns, and ToastStunt maps.

Exit: exact typed results and documented differences pass for both profiles;
unsupported syntax cannot execute; LambdaMOO rejects ToastStunt map syntax.

### M2 — Control flow, errors, and live execution

Implement branching, loops, scatter/splicing, flow signals, inline catches,
try/except/finally, and execution/allocation limits. Add live output plumbing,
Stop and worker restart as runnable programs become available.

Exit: control-flow/error suites and cancellation tests pass. Output is ordered;
limits cannot be bypassed by MOO exception handlers; UI remains responsive.

### M3 — World, inheritance and programmable objects

Implement world storage, properties, frames, inherited calls, `pass()`, creation,
programming, deletion, inspection, minimal built-ins and teaching fixture verbs.
Keep receiver/definition distinctions and list/map value semantics correct.

Exit: all six academy scenarios plus lifecycle, inheritance, programming and
profile tests pass through the independent package. No academy logic is embedded.

### M4 — Persistent worlds and JSON snapshots

Implement committed/working worlds, error-versus-Stop behavior, explicit reset,
versioned snapshots, validation, lossless value encoding, and recompilation.

Exit: worlds survive multiple runs and save/load. Ordinary errors and controlled
limits retain prior changes; Stop discards the current run's changes. Bad snapshots never damage a loaded world.

### M5 — Importable v0.1 package and corpus validation

Finalize worker adapter, assets, declarations, Node/browser examples, selected
corpus coverage and packed-package tests. Document limitations and evidence.

Exit: clean consumers install the tarball and exercise both profiles, live output,
Stop, object APIs and snapshots without access to this checkout or a MOO server.

### M6 — Academy adoption

Integrate separately once v0.1 is ready. Show actual output, runtime diagnostics,
and resulting world state; use behavioral assertions and structural assessment
where useful. Apply limits and an explicit fresh-world/retained-session policy.

Exit: academy lessons use the installed package, handle parser/runtime failure,
and demonstrate genuine execution while preserving independent library reuse.

A local tarball or file dependency is sufficient initially. A remote repository
and npm publication are separate future actions, not required to build/import.

## 10. Technical specification work in M0

These are implementation tasks within confirmed requirements, not unresolved
product scope:

- Pin authoritative reference revisions and document numeric/string behavior for
  both profiles; use optional dev-MOO observations where useful.
- Enumerate supported object, property, verb, map and inspection API signatures.
- Define schema, tagged value codec, diagnostic fields, source-span conventions,
  worker event/terminal messages and world commit behavior.
- Define controlled-limit accounting and reserve capacity for state/error return.
- Pin TypeScript/build/test tooling and supported Node/browser versions.
- Preserve MIT notices, define package exports/assets, and document clean installs.
- Record unresolved semantic ambiguities explicitly rather than fabricate behavior.

## 11. Completion checklist

- [x] TypeScript source builds to importable JavaScript/declarations with MIT notices (build and packed consumer checks).
- [ ] Independent package and pinned dependencies build from a clean checkout.
- [x] LambdaMOO/ToastStunt profiles and support matrix are documented and tested (compatibility.md, semantics.md and both-profile suites).
- [x] Broad beginner syntax, maps, inheritance and programmable object APIs work (runtime/world suites and reviewed corpus; explicit exclusions documented).
- [x] Actual runtime results for the six lesson scenarios pass tests (both profiles; tests/academy.test.mjs).
- [x] Live output, Stop and distinct failure categories have clear contracts (docs/workers.md).
- [x] Persistent worlds and JSON snapshots round-trip without losing semantics (both profiles; tests/snapshots.test.mjs).
- [x] Runtime errors and controlled limits retain prior changes; forced Stop discards them (worker tests in both profiles).
- [x] Worker execution cannot freeze the academy UI indefinitely (hard deadline, Stop and browser integration tests).
- [x] Corpus expectations have independent evidence and preserved provenance (tests/corpus/manifest.json and docs/corpus.md).
- [x] Clean Node/browser consumers import the packed package and find its assets (scripts/test-package.mjs, including shipped examples).
- [x] No MOO server or database dump is needed; dev-MOO checks remain optional (isolated source and packed consumer tests).
- [x] Academy integration is validated separately after package readiness (docs/academy-integration.md).
