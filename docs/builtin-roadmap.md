# Builtin coverage and remaining work

Reviewed 2026-09-15 against the LambdaMOO function index and ToastStunt source
revision `aecc51e9449c6e7c95272f0f044b5ba38948459e`.

The catalog exposes **118 LambdaMOO / 217 ToastStunt** names. This includes
limited implementations, stateful simulations, and the two explicitly requested
memory-accounting stubs. Availability does **not** mean full native-server parity.
`listBuiltins()` and `getBuiltinInfo()` expose signatures, returns and limitations;
`function_info()` uses the same catalog.

## Implemented families

- Numeric conversions, mathematics, random values, list/set/string operations,
  sorting and native-reference-tested 1D–4D simplex noise.
- Binary, Base64, URL, JSON and ANSI-tag codecs.
- MOO matching/substitution and a bounded RE2 subset of PCRE matching/replacement.
- Hashes, HMAC, random bytes, bounded Argon2id, traditional DES crypt and salt.
- Dynamic builtin calls, eval, call/task identity, task-local values and budgets.
- Object ancestry, containment/movement hooks, player flags, initialization,
  reparenting, ID renumbering/reuse and metadata operations.
- All 29 file builtins on a persistent virtual filesystem.
- Virtual connections, input/output queues, listeners, HTTP message parsing,
  server logs, checkpoints and selected server options.
- Exact-request fixtures for curl, exec, getenv, spellcheck and outbound connections.
- All nine SQLite builtins, using real SQLite with a deliberately bounded SQL subset.

See [host simulation](host-simulation.md) for integration and limits. The static
catalog's per-function notes are the detailed runtime contract. Every registered
name has independently authored result/effect and metadata contract tests.

## Deliberately unsupported

| Area | Names | Reason |
| --- | --- | --- |
| Multiple inheritance / anonymous objects | `chparents`, `anon` | The world has one parent and persistent numbered identities. Multiple inheritance is explicitly out of scope. Anonymous-object lifetime is a separate unsupported model. |
| Native multithreading | `threads`, `thread_pool`, `set_thread_mode`, `background_test` | Explicitly out of scope; no native worker pool exposed to MOO. |
| Bytecode | `disassemble` | Explicitly out of scope; execution uses an AST evaluator. |
| Native internals | `run_gc`, `gc_stats`, `memory_usage`, `malloc_stats`, `usage`, `waif_stats`, `log_cache_stats`, `verb_cache_stats`, `pcre_cache_stats` | JavaScript GC, memory and caches cannot truthfully report native MOO internals. |
| Process stdin | `read_stdin` | Browser/worker sessions have virtual connection input, not process stdin. |

`value_bytes(value)` returns **0**. `object_bytes(object)` returns **0** after
validating the object exists. These are explicitly documented stubs, never estimates.

## Deferred architecture work

| Names | Required implementation |
| --- | --- |
| `yin`, `task_stack`, `queued_tasks`, `finished_tasks`, `kill_task`, `queue_info`, `resume` | A cooperative scheduler with resumable evaluator frames, fork/read suspension, task ownership, cancellation and snapshot rules. This is separate from the excluded native multithreading. Bounded suspend(seconds) now uses resumable evaluation in async/worker runs, with a five-second cap. A full scheduler, external resume, and indefinite suspension remain deferred. |
| `new_waif` | A distinct WAIF value type, class-based properties/verbs, value serialization and lifecycle handling. Returning an ordinary numbered object would teach the wrong semantics. |

Next steps: introduce resumable evaluator frames first, then queue inspection and
control, then persistence/worker cancellation tests. Add WAIFs only with explicit
value-model and snapshot-version design. Current `task_id`, task-local values and
callers inspect the running execution only; they do not imply a scheduler exists.

## Reference boundaries

The Lambda index lists 125 names. The pinned Toast source has 243 distinct literal
registration names across optional modules/debug builds; no single server is
claimed to expose all 243. Eight indexed Lambda and 26 Toast names remain unavailable. Lambda additionally
exposes task_perms, which is absent from that index.
The unregistered names `panic` and `waifs` in secondary prose lists are not part
of this target. Newer Toast bool/value-model changes are not silently adopted.

References: [LambdaMOO index](https://lambda.moo.mud.org/pub/MOO/html/ProgrammersManual_77.html),
[pinned ToastStunt source](https://github.com/lisdude/toaststunt/tree/aecc51e9449c6e7c95272f0f044b5ba38948459e/src).
