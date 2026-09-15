# Reviewed corpus execution

`tests/corpus/manifest.json` selects 17 cases from eight example files in the
pinned `vendor/moo-for-llms` submodule. Across applicable profiles, these produce
28 executable cases and three intentional unsupported-feature cases. All five
candidates in upstream `docs/runtime-smoke-manifest.json` are included.

The manifest preserves repository, revision, path, SHA-256, license and original
metadata. Every case specifies required features, the teaching fixture, encoded
invocation arguments, exact tagged return value or raised error, output and world
changes. These examples make no world changes and emit no output; the suite checks
both explicitly and compares the full world snapshot before and after execution.
The academy and world suites cover output-producing and mutating programs.

Expectations were written by tracing the source against the language references,
without running this interpreter to generate answers. Each case records that
trace. For example, the partition input `{"a","b","a"}` selects the two a's in
order, then appends b; the sliding-window input `{1,2,3},2` has the two inclusive
windows `{1,2}` and `{2,3}`. The missing-label example returns the explicit
`"untitled"` fallback, while an invalid object raises uncaught E_INVIND.

Semantic evidence:

- [LambdaMOO Programmer's Manual](https://lambda.moo.mud.org/pub/MOO/ProgrammersManual.html):
  list splicing, scatter assignment, membership, inclusive ranges, error-catching
  expressions, property access, and Operations on Strings (`index`/`rindex`).
- [Pinned ToastStunt source](https://github.com/lisdude/toaststunt/tree/aecc51e9449c6e7c95272f0f044b5ba38948459e):
  map indexing and ordering, mapvalues, and string-search implementation in
  `src/list.cc` and `src/utils.cc`. Profile decisions are in semantics.md.

Tests verify the submodule revision, source hashes and original metadata before
execution. Source is read directly from the selected `examples/` paths. No
upstream script runs, no held-out evaluation data is read, and no server is
required. All selected examples declare MIT licensing; the upstream LICENSE is
verified. The corpus and manifest are development files excluded from npm packs.

The test report distinguishes parser acceptance, executable cases, intentional
unsupported cases and failures. LambdaMOO map syntax and both profiles' fork
syntax must produce unsupported-feature diagnostics with zero execution steps.
They are assertions, not skipped tests. The separate 447-fixture grammar test
remains syntax-only evidence and does not imply corpus execution coverage.

Run `npm test` for this suite alongside focused language, world and worker tests.
Adding a case requires an independently reviewed expectation and explanation.
Changing an upstream revision requires explicit hash/metadata review; never
refresh expected values automatically from evaluator output.
