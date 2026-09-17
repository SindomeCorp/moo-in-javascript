# Educational host and expanded builtins

The interpreter remains an educational runtime, not a production MOO server.
Consult `getBuiltinInfo(name).notes` for the supported signature and limitations.

## Configuring external request fixtures

```js
import {createHostEnvironment, moo} from '@sindomecorp/moo-in-javascript';
world.setEnvironment(createHostEnvironment({
  connections: [{player: 7, input: ['hello']}],
  fixtures: [{
    builtin: 'curl',
    args: [moo.string('https://example.test/')],
    result: moo.string('An example response'),
  }],
}));
// MOO: return curl("https://example.test/");
```

Fixtures match the builtin name and complete encoded argument list exactly,
including optional arguments. Missing requests raise E_INVARG. They never access
real network endpoints, processes, environment variables or dictionaries.
`open_network_connection` fixtures return a list of input strings and create a
negative-ID virtual connection. `notify` appends its output and emits the usual
output event. `listen`/`unlisten` manage virtual ports without opening sockets.
`read_http` consumes one complete queued HTTP/1.x message; partial/chunked messages
are rejected. Connection ages use a logical operation clock, not elapsed seconds.
Blocking `read` without queued input raises E_INVARG because there is no scheduler.

The optional `world.environment` contains files, handles, connections, fixtures,
listeners, databases, logs and checkpoint data. It is immutable to callers;
`setEnvironment` validates and replaces it. `saveWorld`/`loadWorld` preserve it.
Worker runs commit it with world changes and discard it on worker termination.
Host state counts against world string-storage quotas and execution budgets.
Old snapshots without host state still load; older library versions cannot read
all new snapshot fields. Each operation validates before committing host changes.

## Files and administration

File functions operate on a virtual tree rooted at `/`; they never touch disk.
Modes follow the four-character Toast form (for example `w+tn`). File timestamps
are logical operation counters. Permissions are stored metadata. Binary strings
use MOO `~XX` escaping. Text handling follows JavaScript strings, not arbitrary
native byte encodings. Flush commits immediately. Removing open files and
rename-overwrite are rejected. Reads at EOF return an empty string.

`server_log` stores messages. `shutdown` records an intent, without terminating the
host application. `dump_database` stores a snapshot checkpoint in host state;
`db_disk_size` reports its encoded byte length. `load_server_options` reads
`fg_ticks` and `fg_seconds` through `#0.server_options`, supplying defaults for
future executions; explicit execution limits override them. Other server options
and general MOO permission enforcement remain unsupported.

## SQLite

Toast runtime initialization loads bundled SQLite (sql.js ASM build, no extra
WASM asset). Named databases persist through close/reopen and world snapshots;
`:memory:` databases are removed on close. Parameters are bound, not interpolated.
64-bit SQL integer results are preserved. Integer parameters outside JavaScript's
safe range are rejected; SQL integer literals support the full SQLite range.

The supported subset includes single-table SELECT, CREATE/DROP TABLE,
INSERT VALUES, UPDATE and DELETE with a small scalar/aggregate function allowlist.
Joins, subqueries, recursive queries, triggers, views, transactions, attachments,
extensions, quoted identifiers and comments are rejected. Caps include 16 pages,
1,000 stored rows, 10,000 SQL characters and 100 result columns. These bounds
prevent native SQLite work from escaping the evaluator's cooperative budgets.
`sqlite_interrupt` validates a handle and returns zero between synchronous queries;
it cannot interrupt an in-flight query. Native engine errors return strings;
argument and quota errors use MOO diagnostics.

## Other compatibility limits

- Regex uses RE2 with bounded pattern/work sizes. Backreferences, lookarounds and
  unsupported syntax raise errors; this is not a complete native PCRE engine.
- Hashes/HMAC and Argon2id are real implementations. Argon2 parameters are capped.
  `crypt`/`salt` support traditional DES only, not modular crypt formats.
- Secure random calls use Web Crypto; `reseed_random` is an explicit no-op.
- Math uses JavaScript floating point and its math library. Formatting and
  exceptional-value details can differ from native libc.
- `ctime` uses UTC. `seconds_left` uses elapsed wall time; default execution time
  limit is 30 seconds, configurable with `limits.seconds` (nonnegative integer).
- `value_bytes` and `object_bytes` are fixed-zero stubs.

See [remaining work](builtin-roadmap.md) and [third-party notices](third-party-notices.md).
