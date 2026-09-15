# Academy runtime adoption

The separate app at `/home/seven/moo-academy/moo-field-manual` installs the built
package through a local tarball dependency and npm lockfile integrity. Its
`build:runtime` script copies installed JavaScript, WASM and MIT notices into
`dist/runtime`, retaining the package's asset layout. The app does not import
library source or embed its lesson assessment into the library.

Initial integration artifact: `moo-in-javascript-0.1.0-dev.0.tgz`, SHA-256
`4890eb9caee3aadfbdd940667d2be27ffc805fd74a5102f0da80bd07f5fef030`.
The app records this in `dist/runtime/provenance.json`.

Behavior:

- Explicit ToastStunt educational profile, fresh teaching world for each Run.
- Live output, actual return values, located runtime diagnostics and committed
  room state. Values display as MOO data rather than codec implementation fields.
- Stop terminates the worker. Ordinary errors and controlled limits retain prior
  changes; the next attempt always begins fresh. Reset restores the inspector.
- Completion combines real output/recipient/state assertions with the existing
  structural exercise assessment. Arguments and branching exercise alternate
  input values. Canned illustrative results have been removed.
- New progress key excludes old syntax-only completion claims. Storage failures
  still allow session-only progress. Parser/runtime/worker failures block awards.
- Default execution caps include one million steps, 20,000 output characters,
  1,000 events and a five-second hard worker deadline.

Validation in the app: six Node groups (including its 447 grammar fixtures) and
ten Chromium browser tests pass. Browser tests cover all six solutions and
failing starters, alternate arguments, safe text rendering, real runtime errors,
limits, Stop, restart/fresh attempts, unavailable workers and parser assets,
progress persistence and responsive layouts.

Run locally with `npm start` in the app, then open `http://127.0.0.1:8000`.
No deployment or publication was performed. The larger curriculum expansion in
its historical HANDOFF.md remains a separate task.
