# Development

Supported target: Node 22 or newer and modern browsers with ES2022, WebAssembly,
and module workers. CI runs the full gates on Node 22 with Chromium from the
pinned Playwright 1.63.0 dependency (Chromium 153), plus the Node suite on Node 24.
Other browsers are
not currently validated. Set `MOO_BROWSER_EXECUTABLE` to an absolute browser
executable path to use an existing compatible Chromium installation for browser
and packed-consumer tests. On Linux, Playwright's `--with-deps` option also
installs system libraries when needed.

To use the published library in an application, run
`npm install @sindomecorp/moo-in-javascript`; building from source is unnecessary.
Start with [Contributing](../CONTRIBUTING.md) for source development in a fresh
clone. Maintainers should also read [Releasing](releasing.md).

```sh
git submodule update --init --recursive
npm ci
npm test
npx playwright install chromium
npm run test:browser
npm run test:package
```

`npm run build` copies the checked-in upstream grammar WASM and npm runtime WASM,
preserves both MIT notices, generates SHA-256 provenance, emits strict TypeScript
declarations and JS, and bundles optional browser/worker entries. It does not
execute corpus scripts or require a native parser addon or Emscripten. Consumers
install built tarballs without submodules or a TypeScript compiler.

The corpus is development-only. Do not ship its examples, evaluations or metadata
in npm artifacts. Its license and original metadata stay in the pinned checkout.
Grammar upgrades require changing the submodule pin and build revision together,
reviewing generated provenance, running tests, and recording compatibility impact.

## Rebuilding the grammar

Ordinary builds use the upstream committed WASM. The optional rebuild uses
Tree-sitter CLI 0.25.10 (commit da6fe9beb4f7f67beb75914ca8e0d48ae48d6406)
and Emscripten 4.0.4 in a Docker image pinned by content digest. Tested on Linux
x86-64. Docker and the CLI are contributor tools, not package dependencies.

```sh
moo_grammar_tools=$(mktemp -d)
npm install --prefix "$moo_grammar_tools" --no-save tree-sitter-cli@0.25.10
docker pull emscripten/emsdk@sha256:47d573d5a86379a06f850de200d69407e6baa2d2f9c19d9e156a67db57f80f2f
npm run rebuild:grammar -- "$moo_grammar_tools/node_modules/tree-sitter-cli/tree-sitter"
```

The script checks the grammar revision and CLI identity, copies inputs into a
temporary directory, regenerates parser.c, checks it against the pinned source,
and builds WASM twice with network access disabled in the container. It writes
`build/grammar/tree-sitter-moo.wasm` and a provenance report without replacing
package assets or modifying the submodule. Temporary input files are removed.
The manually installed CLI directory can be removed afterward.

[Recorded rebuild evidence](grammar-rebuild.json) shows both builds matched the
shipped WASM SHA-256 `f3fb4427daff3de7fbd9d595fd7b1816a1b6fbb594567200f30a565605fb3af2`.
A future compiler change need not yield identical bytes; record and investigate
any difference before changing the shipped artifact.

## Browser imports

`@sindomecorp/moo-in-javascript/browser` is bundled ESM for static hosting. Keep its directory
structure with `assets/`, or supply `grammarWasm` and `runtimeWasm` URLs explicitly.
`@sindomecorp/moo-in-javascript/worker` provides the dedicated browser worker entry. Use
`createWorkerSession` for execution and Stop; see [workers](workers.md). The
parser-only `{type:'parse', id, source, options:{profile}}` protocol remains
available and returns `parsed` or `host-error` with the same ID.

web-tree-sitter initializes once per JavaScript realm. All parser instances in
that realm must use the same runtime WASM URL; differing URLs fail explicitly.
Grammar bytes or URLs can differ per parser. Dispose each parser after use.

## Runnable examples

- `npm run example:node` builds and runs `examples/node.mjs`, including isolated
  execution, real output, a map result and snapshot restoration.
- `npm run example:browser` builds and serves this directory. Open
  `http://127.0.0.1:4177/examples/browser/index.html` for the static playground.
  It supports both profiles, live output, Stop, retained state, Reset and JSON
  Save/Load. Results and diagnostics are rendered as text.

Examples are included in the tarball. After installation, Node can run
`node node_modules/@sindomecorp/moo-in-javascript/examples/node.mjs`. A static server can serve
the installed package directory, keeping examples, dist and assets together.
For application imports use the public package exports documented in workers.md.

`npm run test:clean` copies the current source inputs into a temporary directory,
checks out both pinned submodules independently, installs fresh dependencies with
`npm ci`, and runs the full unit suite. It uses no existing dist or node_modules
and removes the temporary directory afterward. This verifies source completeness
while changes are still uncommitted; final Git checkout verification is separate.

`npm run test:checkout` clones committed HEAD into a temporary directory, uses
local submodule mirrors at the committed gitlink revisions, runs fresh npm ci,
and executes unit, browser and packed-consumer gates. It removes the checkout
afterward. Set MOO_BROWSER_EXECUTABLE when using an existing browser install.

## Testing an existing package artifact

`npm run test:package` builds, packs, tests, and removes its own tarball. To test
an already packed artifact without rebuilding or deleting it, run:

```sh
node scripts/test-package.mjs ./sindomecorp-moo-in-javascript-0.2.3.tgz
```

This validates package identity and required files, then installs the exact
artifact into clean Node, TypeScript, and browser consumers. The release workflow
publishes this same tested artifact. The expected name and version come from the
checkout's package manifest.
