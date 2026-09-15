# Implementation progress

## Current evidence

- Started from planning-only repository on 2026-09-15.
- Pinned both required Git submodules and npm dependencies; lockfile created.
- Strict ESM/declaration build, copied WASM assets, hashes, and MIT notices.
- Shared Node/browser parser with owned syntax data and guaranteed tree disposal.
- Required profile, syntax diagnostics, map/fork profile rejection.
- All 447 grammar fixtures checked: 434 accepted, 13 intentionally unsupported.
- Browser parser worker test passed in installed Chromium 153.0.8010.12.
- Clean tarball Node/TypeScript/browser consumer tests passed, including static
  subpath hosting, explicit WASM URLs and bundled worker default asset loading.
- Immutable tagged values and bounded JSON codec implemented; nested values,
  wide integers, negative zero, malformed data and profile restrictions tested.
- Owned executable AST and runtime compile/execute/run APIs now implemented.
- Operators, locals, lists, slices, map operations and formatting implemented.
- If/elseif/else, while, list/range loops, break/continue/return, scatter, splicing,
  inline catches, try/except/finally and expression/resource budgets implemented.
- Exact runtime tests cover both profiles, immutable updates, source diagnostics,
  semantic differences, defaults, error ordering, and non-catchable limits.
- World model now supports retained object/property/verb state, inherited clear
  slots, metadata, creation/recycling, local inspection, and verb source updates.
- Nested MOO verb calls and pass have independent frames and error tracebacks.
- Live output, output/call/world bounds, atomic mutations, and committed prior
  changes on ordinary errors and controlled limits are covered by tests.
- All six academy scenarios and meaningful failing alternatives execute under
  both profiles; see academy-evidence.md. Academy app itself is unchanged.
- Browser tests: 3 passed, including shared core/fixture identity and real output.
  Clean tarball Node/TypeScript/browser checks passed with world/fixture usage.
- Strict typecheck passes; current test totals are recorded below.
- Versioned JSON snapshots preserve profile, allocation state, inherited slots,
  metadata, source, all value tags and stable host IDs. Loading validates an
  isolated candidate and recompiles all source before atomic replacement.
- Retained sessions support Save/Load, Reset to initial state, and fresh attempts.
- Host registrations support explicit MOO errors, resource charges and output;
  missing registrations and host bugs remain infrastructure failures.
- Snapshot suites bring the unit total to 47 passing groups. Browser snapshot/
  Reset checks pass (4 browser tests), as do clean packed Node/browser save-load
  and source-execution checks.
- Browser verification used `MOO_BROWSER_EXECUTABLE` pointing to the existing
  Chromium 1243 headless-shell build. Pinned Playwright's browser download was
  cancelled after successful alternative validation; pinned-browser CI remains
  unverified locally. No remote CI run has been claimed.

## Next work, preserving full plan

1. Finish M0 semantic reference review, exact builtin signatures, result/snapshot
   contracts and pinned-browser checks.
2. Finalize the conformance support matrix and documented grammar limitations.
3. Audit M2 limits and failure boundaries after isolated worker implementation.
4. Finish M3 deeper lifecycle/inspection conformance and metadata edge coverage.
5. Complete M4 final snapshot conformance review; worker transfer capacity is reserved.
6. M5 final clean Git checkout verification and release documentation.
7. M6 separate academy adoption only after standalone package readiness.

The full plan remains active. Conformance completion, final packaging evidence
and academy application adoption remain required.
Parser acceptance alone must never be counted as runtime or conformance coverage.

## Worker execution evidence

- Dedicated browser and Node workers stream output and transfer final snapshots.
- Success, runtime errors and controlled limits commit validated terminal state.
  Stop, hard deadlines and host failures preserve the committed world.
- Tests cover mutation locks, output callback failure, transport crash, late
  messages, Stop from live output, reset and worker restart.
- All 51 unit groups and 5 browser tests pass. Clean packed Node and static
  browser consumers pass, including subpath worker Stop and restart.
- See workers.md for the public API, transfer limits and host callback boundary.

## Reviewed corpus evidence

- Seventeen manifest cases cover eight upstream example files, including all
  five upstream runtime smoke candidates. Expectations are independently traced.
- Both profiles yield 28 executable and 3 explicit unsupported cases, all passing.
- Added bounded index/rindex built-ins, including ToastStunt offset behavior.
- Provenance checks retain source revision, hashes, original metadata and license.
- See corpus.md and tests/corpus/manifest.json for inputs and exact expectations.
- Full unit verification after the corpus changes: 56 passing test groups.

## Rebuild and consumer example evidence

- Pinned Tree-sitter 0.25.10 and digest-pinned Emscripten 4.0.4 regenerate identical
  parser source and reproduce the shipped WASM byte-for-byte in two builds.
  See grammar-rebuild.json and development.md for tooling and reproduction.
- Shipped Node and static browser examples run from an installed tarball.
  Browser coverage includes safe text rendering, Stop, snapshots and profiles.
- Six browser tests and clean packed-consumer checks pass.
- An isolated source copy with freshly checked-out submodules and npm ci passes
  all 56 unit groups. No existing dependencies or build outputs are reused.
- Final Git checkout verification remains distinct: implementation files are
  currently uncommitted. The full goal still requires the remaining audits and
  academy adoption.

## Result and transfer boundary audit

- Direct and worker execution now share result codec limits. Deep lists and
  exponentially expanded shared subtrees return controlled limits and retain
  prior state/output, with tests under both profiles.
- Worker change reports distinguish positive and negative floating zero.
- Worker snapshot capacity is reserved from configured world quotas, including
  JSON escaping and metadata. A custom world exceeding the public snapshot
  default still commits its terminal runtime-error state and resets correctly.
- Dedicated worker tests: nine groups pass after these changes.

## Text boundary evidence

- Both profiles have exact source-span checks across UTF-16 surrogate pairs,
  CRLF lines and tabs, plus nested verb diagnostic/frame locations.
- Host string execution has an explicit UTF-16 extension policy: code-unit
  indexing/slicing, ASCII-only case folding, lossless snapshots and exact output.
- Four new text-boundary test groups pass. Portable source literals retain their
  documented ASCII/tab restriction, including comment strings.

## Academy adoption

- The separate academy app installs the built tarball and runs actual lessons
  through workers, with live output, Stop, real state and behavioral assertions.
- Six app Node groups and ten browser tests pass. All six lessons execute;
  failures, alternate arguments, limits, fresh state and worker failure are covered.
- See academy-integration.md for artifact provenance and the independent app path.
- The full goal remains active pending final conformance and clean Git verification.
