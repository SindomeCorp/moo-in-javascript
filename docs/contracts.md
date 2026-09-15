# Runtime contracts

These v0.1 contracts are implemented with the explicit compatibility boundaries
in compatibility.md. Detailed APIs are in api.md, snapshots.md and workers.md.

## Invocation and results

`createRuntime({profile, grammarWasm?, runtimeWasm?})` creates an isolated runtime.
`compile(source)` returns a program owned by that runtime/profile or diagnostics.
`execute(program, {world, context, limits?, onOutput?})` rejects runtime/program/
world mismatches as host configuration errors before executing anything.
`run(source, options)` composes compile and execute. `dispose()` releases parser
resources and rejects further operations. Context holds tagged `this`, `player`,
`caller`, and a list of arguments; it never lives in a world snapshot.

Results discriminate `completed`, `syntax-error`, `unsupported-feature`,
`runtime-error`, `limit-exceeded`, and `cancelled`. Successful results carry a
tagged return value. All results carry output, structured changes, commit state
(`committed` or `discarded`), and diagnostics. Cancellation has null statistics;
other results include execution counters. Worker host failures reject through
WorkerHostError with output and commit `unavailable`, outside the result union.
Diagnostics carry a category, optional MOO error code, message, source span and
verb call stack. Source positions are zero-based UTF-16 offsets/rows/columns,
with exclusive ends; presentation layers may show one-based locations.

Host callback failures, missing registrations, parser initialization and invalid
host configuration use `HostError`, outside catchable MOO errors. MOO `raise()`
cannot impersonate execution limits or infrastructure failure.

## Managed state and budgets

Direct synchronous execution commits each successful mutation. Ordinary errors
and controlled limits retain earlier mutations. Each mutating operation validates
and charges its full budget before applying any part of that operation.

Worker execution starts from a snapshot. It streams `{runId, sequence, recipient,
text}` output events, then transfers a terminal result and snapshot. Only completed,
runtime-error and limit-exceeded terminals may replace the committed world.
Forced termination, Stop or hard timeout discards that run's snapshot and restarts
from the last committed world. Previously delivered output is retained; late
messages are ignored by run ID, and output is never replayed as new events.

Run, save, load and reset are serialized per retained session. Strong cancellation
uses worker termination. An AbortSignal cannot interrupt synchronous evaluation.
Custom host callbacks may have external effects that world rollback cannot undo.

Budgets must bound steps, call depth, collection/string allocation, total output
characters, output event count, source size, and resulting world size. Charge
host operations proportional to work; reserve capacity for terminal reporting.
No exception handler can reset or catch a resource budget exhaustion.

## Snapshot schema

Version 1 envelope: `{version:1, profile, nextId, objects}`. IDs and nextId use
canonical decimal strings. Objects have IDs, one parent, metadata, explicit
property definitions/overrides and verbs. Properties carry name, value, owner,
permission flags and clear/inheritance state. Verbs carry names, owner,
permission flags, argument specification and either MOO source or stable host ID.
The snapshot validator enforces the schema described in snapshots.md.

Value encoding uses discriminated JSON objects: int has a decimal string; float
has finite numeric data (negative zero must round-trip); string has text; object
has decimal ID; error has a known code; list has recursively encoded values;
map has encoded entry pairs preserving documented key semantics. No prototypes,
native functions, parser nodes, ASTs, invocation context or UI history are stored.

Validate size/depth before constructing values, uniqueness and ID allocation,
parent existence/cycles, profile restrictions, metadata and known host IDs.
Ordinary dangling object references in MOO values remain legal; dangling parents
do not. Recompile every saved verb under the saved profile. Only replace an
existing world after all validation/recompilation succeeds. Never deserialize JS.

## Required builtin signatures

All arguments require explicit type and arity checks. Metadata is accepted and
returned without permission enforcement. Lifecycle hooks are an explicit
unsupported boundary: creation/recycling with such hooks fails before mutation.

| Function | Required signature |
| --- | --- |
| notify | `(object recipient, string text)` |
| tostr, toliteral | `tostr(value, ...values)`, `toliteral(value)` |
| typeof, length, valid | `typeof(value)`, `length(string/list/map)`, `valid(object)` |
| raise | `(error code [, string message [, value]])` |
| create, recycle | `create(object parent [, object owner])`, `recycle(object)` |
| parent, children | `(object)` |
| properties, verbs | `(object)` |
| add_property | `(object, string name, value initial, list {owner, perms})` |
| delete_property | `(object, string name)` |
| property_info, set_property_info | `(object, string name [, list info])` (setter requires info) |
| is_clear_property, clear_property | `(object, string name)` |
| add_verb | `(object, list {owner, perms, names}, list {direct, prep, indirect})` |
| delete_verb | `(object, string-or-int descriptor)` |
| verb_info, set_verb_info | `(object, descriptor [, list info])` (setter requires info) |
| verb_args, set_verb_args | `(object, descriptor [, list args])` (setter requires args) |
| verb_code | `(object, descriptor [, fully_parenthesize [, indent]])` |
| set_verb_code | `(object, descriptor, list-of-source-lines)` |
| pass | `(...arguments)` in a verb frame with ancestor lookup |

Supported ToastStunt map operations and string searches are enumerated in api.md
and covered by reviewed tests. Other conversion/list helpers are not provided.
