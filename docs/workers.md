# Isolated execution

`createWorkerSession({ runtime, world })` uses a dedicated browser Worker for each
run. Node callers supply `workerFactory: nodeWorkerFactory()` from the
`@sindomecorp/moo-in-javascript/node-worker` export. The runtime on the calling thread validates
snapshots and recompiles source before accepting a worker's final world.

```js
import { createRuntime, createWorkerSession, moo } from '@sindomecorp/moo-in-javascript/browser';
import { createTeachingWorld } from '@sindomecorp/moo-in-javascript/browser/fixtures';

const runtime = await createRuntime({ profile: 'toaststunt' });
const world = createTeachingWorld({ profile: 'toaststunt' });
const session = createWorkerSession({ runtime, world });
const run = session.run('player:tell("hello"); this.lamp_on = 1;', {
  context: { this: moo.object(42), player: moo.object(7) },
  timeoutMs: 5000,
  onOutput(event) { console.log(event.text); },
});
// Connect the UI's Stop button to run.stop().
const result = await run.result;
```

Plain static browser pages import `dist/browser/index.js` and
`dist/browser/fixtures.js` together. The default worker URL is relative to the
shipped module, including under a hosting subpath. A bundler that relocates files
can supply `workerFactory: browserWorkerFactory(customWorkerURL)` and
`parserOptions: { grammarWasm, runtimeWasm }` for assets inside the worker.

## Outcomes

| Result | Committed world | Output |
| --- | --- | --- |
| `completed` | Replace with validated final snapshot | Retained |
| `runtime-error` | Commit changes made before the error | Retained |
| `limit-exceeded` | Commit changes made before the limit | Retained |
| `syntax-error`, `unsupported-feature` | Unchanged | None |
| `cancelled`, reason `stop` or `timeout` | Unchanged | Delivered events retained |
| Rejected promise (`WorkerHostError`) | No incomplete state committed | Available on error.output |

A hard deadline defaults to 5000 ms and includes worker startup, parsing and
execution. Stop/timeout actually terminate the worker. The cancellation result
has `statistics: null`: the terminated worker cannot report final counters.
Native worker failures, missing host registrations, invalid transfers and output
callback failures reject through `WorkerHostError`, whose `commit` is
`unavailable`. This distinguishes missing terminal state from a controlled MOO
failure. The caller's last committed world remains available.

Output arrives in sequence, starting at zero, with a unique run ID and a decoded
object recipient. A final result includes the same events for inspection; it
does not call onOutput again. Stop preserves events delivered to the adapter;
buffered messages may be lost. Late messages are ignored. A new run always starts
from the committed world, without replaying previous output.

While a run is active, the world rejects another execution, direct mutation,
save, load or reset. `session.busy` reports this period. `session.save()`,
`session.load(input)` and `session.reset()` operate between runs; Reset restores
the construction-time snapshot. For fresh attempts, create a new fixture and
session for each attempt. Dispose the caller's runtime after its runs finish.

## Protocol and host capabilities

The worker receives a source string, explicit profile, versioned world snapshot,
encoded invocation values, limits and request ID. Messages are JSON-safe: MOO
values use the tagged codec; frame IDs use decimal strings. Output messages
precede one terminal message containing result, full snapshot and output count.
No AST, function, parser object or live World instance crosses this boundary.
The adapter validates the snapshot and decodes result values before replacement.
An oversized return value produces a controlled transfer-limit result, with
prior world changes committed.

The default worker exposes only the interpreter's built-ins. Custom workers can
install `createWorkerHandler(send, hostVerbs)` from
`@sindomecorp/moo-in-javascript/worker-handler`, with stable host registration IDs. Register
those IDs on the validating runtime as well. Functions stay in their respective
realms and are never deserialized. Custom external side effects cannot be rolled
back by Stop; only managed world state participates in the transaction.

`WorkerTransport` supports custom transports through `postMessage`, `terminate`
and `subscribe`. A transport must deliver ordered messages and actually terminate
execution. The standard browser and Node factories provide these guarantees.

### Reserved transfer capacity

Worker snapshot limits are calculated conservatively from the configured world
quotas before execution. Capacity includes JSON escaping (up to six characters
per UTF-16 unit), value tags, IDs, metadata, arrays and object fields. Both ends
use the same bounds. This avoids losing an otherwise valid terminal world merely
because it exceeds the public snapshot API's default 16 million character limit.
Quota combinations whose capacity cannot be represented safely are rejected
before starting a worker. The value codec still bounds each property and result.

Public `session.save(limits?)` and `session.load(input, limits?)` retain the normal
snapshot defaults; callers saving larger custom worlds can explicitly increase
those limits. Worker execution and Reset use reserved capacity internally.
Direct and worker execution both enforce the default result codec bounds:
100 levels, 100,000 expanded values and 1,000,000 string units. Exceeding a bound
returns a controlled `resultValue` limit with prior changes and output retained.
Subtree sharing in local lists does not bypass the expanded-value bound.
