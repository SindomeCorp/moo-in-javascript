# Contributing

Bug reports, documentation improvements, and focused pull requests are welcome.
This is an educational MOO interpreter with explicit compatibility boundaries;
read the [compatibility guide](docs/compatibility.md) before extending behavior.

## Set up a checkout

Install Node.js 22 or newer, npm, and Git. CI covers Node 22 and 24 on Linux.

```sh
git clone --recurse-submodules https://github.com/SindomeCorp/moo-in-javascript.git
cd moo-in-javascript
npm ci
npx playwright install chromium
npm test
```

If you already cloned without submodules, run
`git submodule update --init --recursive`. Both pinned submodules are needed for
builds and the corpus tests. Ordinary builds need no Docker, native parser addon,
or Emscripten. npm consumers do not need the submodules.

On Linux, `npx playwright install --with-deps chromium` can also install required
system libraries. To use an existing compatible browser, set
`MOO_BROWSER_EXECUTABLE` to its absolute executable path. See
[Development](docs/development.md) for examples and grammar rebuild instructions.

## Report an issue

Use [GitHub Issues](https://github.com/SindomeCorp/moo-in-javascript/issues).
Include the package version, Node/browser version, selected profile, minimal MOO
source and JavaScript setup, and the expected and actual results. For behavior
borrowed from a server, identify its dialect/version and reference or reproduction.
Parsing and runtime execution are distinct; indicate which failed.

## Make a change

Create a branch from `main`, keep each pull request focused, and explain the
problem and resulting behavior. Add a regression test for a bug or new behavior,
using independent expected results for values, diagnostics, output, and world
state. Cover both profiles where relevant, including their deliberate differences.
Use small test-owned worlds unless the teaching fixture itself is under test.

Update public documentation and examples when behavior or imports change. Match
the surrounding code style; no formatting framework or commit-message convention
is required. Discuss major API changes and large compatibility extensions in an
issue before investing in an implementation. Maintainers review pre-1.0 API
changes explicitly; do not assume upstream MOO behavior is already supported.

Before opening a pull request, run the checks relevant to your changes:

```sh
npm run typecheck
npm run test:coverage
npm run test:browser
npm run test:package
```

The coverage command runs the Node suite, so a separate `npm test` is unnecessary
when that gate passes. Browser checks require Chromium. Package tests install the
built tarball in a temporary consumer and require access to the npm registry.
Include commands and results in the pull request; explain any checks you could
not run. CI runs the full gates and a Node 24 unit job.

`npm run test:clean` verifies current source inputs with fresh dependencies.
`npm run test:checkout` checks committed HEAD, not uncommitted work; use it after
committing to verify source completeness before the first push or a release.

## Dependencies and generated files

Commit package manifest and lockfile changes together. Do not commit `dist/`,
`node_modules/`, coverage reports, test output, or npm tarballs. The tracked WASM
assets and provenance are intentional exceptions to generated-file exclusion.

Keep upstream submodule pins explicit. Grammar changes must update the revision
check in the asset build script, regenerate assets/provenance, run compatibility
checks, and describe their impact. Preserve upstream licenses and update
[third-party notices](docs/third-party-notices.md) when bundled dependencies change.
Do not copy development corpus data into the published package.

Maintainers manage versions and publication using [Releasing](docs/releasing.md).
Contributors should leave the version unchanged unless a PR is specifically a
release preparation.
