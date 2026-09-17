# Worlds, calls and output

`createWorld({profile, limits?})` creates an empty world. The optional fixture
entry exports `createTeachingWorld({profile})`, with root class #1 and its children: system #0, generic room #3,
generic thing #5, and generic player #6. Learner #7 inherits from #6;
Training Room #42 inherits from #3. System aliases `$room`, `$thing`, and
`$player` reference the generic classes without being inherited by their instances. The room declares lamp_on and locked. Generic Player's inherited tell
and notify names share a MOO-source verb using notify and tostr; the evaluator
does not special-case teaching IDs or names.

Pass a world to `runtime.run(source, {world, context, onOutput, limits})`. Retain
the same world for later runs to retain changes, or construct a new world for an
isolated attempt. Pure expressions may omit the world. Runtime/world profile
mismatches fail before execution. Concurrent or reentrant executions on the same
world are rejected; different worlds remain independent.

## Properties and object lifecycle

Objects have a single parent, immutable values, local metadata and verb source.
Inherited property slots carry independent owner/perms metadata and either an
override or a clear marker; a clear read follows the parent chain. New inherited
slots start clear. The c flag assigns a new inherited slot's owner to the child
owner. Defining, renaming or deleting a property updates all descendants.
Properties cannot be implicitly created by assignment. Built-in location and contents reflect containment; use move() to change them.
Direct writes are rejected.
Other built-in properties are stored with type checks. Permission metadata is
accepted and returned without enforcing permissions, including verb x flags.

Ordinary creation allocates increasing IDs. Explicit renumber(), reset_max_object()
and ToastStunt recreate() operations can reuse IDs. Recycling reparents
children to the removed object's parent, removes properties originating on the
removed object, and leaves ordinary object references dangling. Root/child
traversal and total object/property/verb/value/string storage are bounded. Each
mutation validates and charges its budget before committing the changed records.

The supported MOO operations include create, recycle, valid, max_object, parent,
children, properties, property_info, set_property_info, add_property,
delete_property, is_clear_property and clear_property.

create() and recreate() call initialize when present. recycle hooks remain
explicitly rejected before recycling. move() dispatches accept/exitfunc/enterfunc. Ownership quotas and server-level object hooks are not implemented;
the educational runtime uses its explicit world budgets. No permission checks,
anonymous objects or waifs are provided. chparent() supports single-parent
reparenting with inherited-property conflict validation.

## Verbs and programming

Nested calls use independent locals with receiver, defining object, player,
caller, programmer metadata, name and arguments. pass searches above the current
defining object while preserving the receiver. Verb aliases and a single-star
abbreviation follow MOO name matching. Missing world verbs report E_VERBNF;
unavailable host builtins report E_INVARG with an explicit message.

Supported APIs: verbs, add_verb, delete_verb, verb_info, set_verb_info, verb_args,
set_verb_args, verb_code and set_verb_code. Integer descriptors select one-based
local definitions; string descriptors match names/aliases. Inspection and editing
do not implicitly change ancestor definitions. Metadata and argument specifiers
are validated, even though command dispatch and permission enforcement are absent.

set_verb_code compiles the supplied source lines under the world's profile. It
returns an empty list on success or diagnostic strings on failure; a failed
compile never replaces working source. Host-inserted source is checked on its
first call and invalid source raises HostError. verb_code returns stored source;
nonzero pretty-print options are explicitly unsupported. Stable host verb IDs
use explicit runtime registrations; see [snapshots](snapshots.md).

## Termination and output

notify emits ordered events containing runId, zero-based sequence, tagged
recipient and text. Delivery is synchronous during evaluation; callers render
text rather than HTML. Output character/event limits stop before emitting an
event that would exceed the limit. Output callback failures throw HostError and
cannot be caught by MOO handlers. Direct execution does not roll back state on
host callback failure; strong isolation requires the worker adapter.

Completed runs, ordinary runtime errors and controlled limits return committed
prior changes. Changes contain created, updated or recycled object records;
records include property/verb source and metadata. An update comparison uses
immutable before/after records. A create-then-recycle within one run produces no
remaining object delta, but an allocation-state change reports the advanced
nextId. Snapshot support must retain this. Nested MOO errors carry source spans
and call frames; caught traceback
lists use the MOO six-field frame shape through the catching frame.

Call, expression, step, allocation, output and world limits are distinct.
Snapshot persistence and Reset are implemented; see [snapshots](snapshots.md).
Forced Stop, hard timeouts and worker commit/discard semantics are implemented;
see [workers](workers.md). Synchronous limits are not a Stop control.
