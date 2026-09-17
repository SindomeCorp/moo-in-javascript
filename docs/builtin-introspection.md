# Builtin introspection (v0.2)

A single profile-aware catalog powers the JavaScript APIs, builtin arity checks,
MOO function_info() and the academy's builtin reference.

```js
import { listBuiltins, getBuiltinInfo } from '@sindomecorp/moo-in-javascript';
const available = listBuiltins({ profile: 'toaststunt' });
const notify = getBuiltinInfo('NOTIFY', { profile: 'toaststunt' });
console.log(notify.parameters, notify.returns);
// Existing runtimes also expose runtime.listBuiltins() and
// runtime.getBuiltinInfo(name), using their selected profile.
```

Static calls are synchronous and require no parser initialization or WASM assets.
Results are deeply immutable and JSON-safe. Listings use alphabetical order;
lookups fold ASCII case and return undefined for unknown/unavailable names.
Profiles are mandatory. Invalid host arguments throw HostError; runtime methods
also reject use after disposal.

BuiltinInfo includes name, summary, notes, minArgs, maxArgs (null for unlimited),
parameters and an optional rest parameter. Each parameter has name, accepted
types, description and an optional flag. Returns contain possible types and a
behavior description, including constant results and `never` for raise().
Metadata documents actual implementation limitations; it does not promise a full
server builtin library. Existing value/metadata validation stays in implementations.

The catalog includes pass and function_info itself, but not world verbs such as
tell or host-registered verb IDs. LambdaMOO has 118 entries; ToastStunt has 217,
including map operations. Search offsets are advertised only in ToastStunt.

## MOO interface

```moo
return function_info("notify");
"Returns {\"notify\", 2, 2, {OBJ, STR}}.";
```

Without a name, function_info() returns all descriptions in alphabetical order.
Each description is `{name, minArgs, maxArgs, types}`. Unlimited maxArgs is -1;
the types list has maxArgs entries, or minArgs entries when unlimited. Types use
MOO typeof codes; -1 denotes any/general unions, and -2 denotes an int/float
union. Return metadata is deliberately exposed only through JavaScript.

Unknown/profile-unavailable names raise E_INVARG. Invalid argument types raise
E_TYPE; invalid arity raises E_ARGS. Output construction consumes execution steps
and allocations, with ordinary controlled-limit commit semantics. Introspection
itself neither emits output nor modifies world state. Workers use the existing
value encoding without any protocol or snapshot schema changes.

Contract references: [LambdaMOO manual](https://lambda.moo.mud.org/pub/MOO/html/ProgrammersManual_54.html)
and [pinned ToastStunt implementation](https://github.com/lisdude/toaststunt/blob/aecc51e9449c6e7c95272f0f044b5ba38948459e/src/functions.cc).
The four-field format is compatible; signatures describe the builtins actually
supported here, including narrower accepted types where our implementation differs.

## Memory-accounting stubs

Both profiles expose `value_bytes(value)` and `object_bytes(object)` as explicit
stubs. They return the integer **0**, a fixed placeholder rather than an actual
size. Catalog summaries and return descriptions identify this limitation.
`value_bytes` accepts any supported value, including dangling object references;
it does not dereference objects. `object_bytes` requires an object reference
(`E_TYPE` otherwise) to an existing object (`E_INVIND` otherwise). Both require
exactly one argument (`E_ARGS` otherwise), produce no output, and do not mutate
the world. Native wizard permission checks are not implemented.
