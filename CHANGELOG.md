# Changelog

Release notes are maintained manually. This package is pre-1.0; compatibility
changes are called out here before publication.

## 0.2.5 — 2026-09-17

- Fixes the release artifact path so npm publishes the tested local tarball
  instead of interpreting its directory as a GitHub repository reference.
- Includes the published-package documentation and release retry improvements
  prepared in 0.2.4.

## 0.2.4 — 2026-09-17 (GitHub only)

The GitHub release passed validation, but npm publication failed before upload
because of the artifact path. Superseded by 0.2.5.

- Updates the README and installation instructions for the published npm package.
- Records the initial release date and focuses the maintainer guide on future releases.
- Skips the release publication dry run when the version already exists on npm,
  allowing duplicate releases and workflow retries to complete successfully.
- Uses the selected npm distribution tag during the publication dry run.

## 0.2.3 — 2026-09-17

Initial public release on [npm](https://www.npmjs.com/package/@sindomecorp/moo-in-javascript/v/0.2.3).

- Introduces the public `@sindomecorp/moo-in-javascript` package for Node.js and
  browsers, with JavaScript ESM, TypeScript declarations, and bundled WASM assets.
- Provides explicit LambdaMOO and ToastStunt profiles, typed results, diagnostics,
  execution budgets, in-memory worlds, source verbs, and versioned JSON snapshots.
- Supports browser and Node workers, live output, Stop/timeouts, and session Reset.
- Includes builtin introspection, simulated host services, and bounded SQLite
  support, with documented compatibility limitations.
- Validates browser execution with Playwright 1.63.0 / Chromium 153; documents
  the SQLite worker limitation observed in Chromium 141.
- Adds consumer and contributor guides, clean package checks, and automated npm
  releases following the initial local publication.

Earlier versions and integration artifacts were development milestones. Their
historical evidence remains in the repository documentation. The scoped public
package begins at 0.2.3; this is not a full MOO server implementation.
