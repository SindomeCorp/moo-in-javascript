# Implementation status

The PLAN.md v0.1 implementation is complete. See [completion-audit.md](completion-audit.md)
for requirement-by-requirement evidence and [compatibility.md](compatibility.md)
for the explicit educational subset.

## Verified deliverables

- Strict TypeScript compiled to ESM JavaScript and declarations; Node and static
  browser consumers, packaged workers, assets and dependency MIT notices.
- Mandatory LambdaMOO/ToastStunt profiles; immutable tagged values, expressions,
  control flow, scatter/splice, catches/finally and ToastStunt maps.
- Retained worlds, single inheritance/pass, object/property/verb programming,
  trusted host registrations and real ordered output.
- Atomic snapshots with source recompilation, lossless IDs/values, Reset and
  fresh attempts. Worker runs commit complete terminal worlds on success/errors/
  controlled limits and discard on Stop, deadline or incomplete host transfer.
- Bounded execution/results/worlds and reserved snapshot transfer capacity.
- Reviewed corpus: 17 manifest entries, 28 executable and 3 unsupported profile
  cases, including all five upstream runtime smoke candidates. Provenance and
  static expected-result derivations are retained.
- Reproducible grammar rebuild with pinned CLI and digest-pinned Emscripten;
  generated parser and repeated WASM builds match the shipped artifact.
- Separate academy adoption using an installed tarball, real output/state,
  behavioral assertions, Stop and explicit fresh-attempt policy.

## Verification

- Library: 67 Node test groups and 6 browser tests pass.
- Clean Git checkout: fresh npm ci, unit/browser tests and packed Node/TypeScript/
  browser consumer tests pass. Consumers include static subpath hosting and both
  shipped examples. No existing dist or node_modules is reused.
- Academy: 6 Node groups and 10 browser tests pass, including all six lessons,
  alternate arguments, failures, output limits, Stop/restart and storage failures.
- CI is configured for Node 22 and pinned Playwright. Local browser verification
  uses Chromium 153.0.8010.12 via MOO_BROWSER_EXECUTABLE; no remote CI run is claimed.

No MOO server, database dump, deployment or npm publication is required or used.
The larger academy curriculum expansion in its historical handoff remains a
separate task, outside this interpreter plan.
