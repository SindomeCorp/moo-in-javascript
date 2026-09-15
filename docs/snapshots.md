# Snapshots and retained sessions

Snapshots contain world data, the compatibility profile and MOO verb source.
They exclude parser trees, compiled programs, JavaScript callbacks, editor
history and invocation context.

```js
import { createRuntime, createSession, loadWorld, moo } from 'moo-in-javascript';
import { createTeachingWorld } from 'moo-in-javascript/fixtures';
const runtime = await createRuntime({ profile: 'toaststunt' });
try {
  const world = createTeachingWorld({ profile: 'toaststunt' });
  const session = createSession({ runtime, world });
  session.run('this.lamp_on = 1;', { context: { this: moo.object(42) } });
  const json = session.save();
  session.reset();    // Restores the world supplied at session creation.
  session.load(json); // Atomically replaces its current data.
  const independentWorld = await loadWorld(json); // Uses the saved profile.
  console.log(independentWorld.getProperty(42n, 'lamp_on'));
} finally { runtime.dispose(); }
```

## APIs

- `saveWorld(world, limits?)` returns JSON; `worldSnapshot(world, limits?)` returns
  plain data. `runtime.saveWorld(world, limits?)` also checks profile agreement.
- `runtime.loadWorld(jsonOrData, {world?, worldLimits?, limits?})` recompiles every
  saved source verb synchronously. Without world it returns a new world; with
  world it atomically replaces that instance's data. Runtime, snapshot and target
  profiles must agree.
- `await loadWorld(jsonOrData, options?)` creates a temporary runtime using the
  saved profile, validates/recompiles, then disposes the temporary runtime. Options
  accept WASM overrides, hostVerbs, a target world, worldLimits and snapshot limits.
  There is no preferred-profile override of saved semantics.
- `createSession({runtime, world})` validates an initial reset snapshot. `run`
  retains changes; `save` and `load` delegate to the APIs above. `reset` restores
  the initial snapshot, even after loading another snapshot. `runFresh` returns
  `{result, world}` for an attempt starting from the initial snapshot, without
  changing the retained world.

These APIs do not write files or localStorage. Consumers decide where JSON lives.
Save/load/reset are rejected during active execution of the affected world.
Validation, compilation, registration and profile failures throw HostError and
leave the target unchanged. No saved verb executes on load.

## Version 1 schema

The schema is enforced in `src/snapshots/codec.ts` and exposed as the WorldSnapshot
TypeScript interface. Unknown fields are rejected.

| Record | Required fields |
| --- | --- |
| Envelope | version (1), profile, nextId, objects |
| Object | id, parent, owner, name, flags, properties, verbs |
| Flags | programmer, wizard, r, w, f; each 0 or 1 |
| Property | name, origin, owner, perms, value |
| Source verb | names, owner, perms, args, source |
| Host verb | names, owner, perms, args, hostId |

IDs use canonical decimal strings. nextId may be one beyond the largest supported
ID, representing an exhausted allocator. A verb has exactly one of source/hostId.
Property value is a tagged encoded value or null for an inherited clear slot.
Values preserve integers, finite floats including negative zero, strings, object
references, errors, lists and ToastStunt maps. Encoded maps reject duplicate
equivalent keys; MOO map construction retains its normal replacement behavior.

Parents must exist or be #-1; inheritance is acyclic and bounded. Inherited slots
must match the immediate parent's slots and an ancestor's definition. Direct
definitions cannot be clear or shadow inherited definitions. Duplicate IDs/names,
malformed metadata and profile violations fail. Dangling value references and
metadata owners remain legal after recycling; structural parent/origin references
must resolve. nextId exceeds every live ID, including after recycling the last ID.

Default snapshot limits: 16,000,000 UTF-16 characters of serialized JSON,
1,000,000 visited JSON nodes, and 512 JSON nesting levels. Value decoding retains
its 100-level MOO nesting bound. World storage limits apply independently as host
policy and are not saved; loading into a target keeps its limits. Raw inputs must
be plain JSON data. Accessors, custom prototypes, functions, cycles, shared object
references, sparse arrays and non-finite numbers are rejected without invoking
accessors.

## Host verb registrations

Pass stable ID/function mappings to createRuntime or standalone loadWorld:

```js
const hostVerbs = {
  'example.echo': host => {
    host.chargeSteps(1);
    host.notify(moo.object(host.frame.player), 'Host callback');
    return host.args[0] ?? moo.int(0);
  },
};
const runtime = await createRuntime({ profile: 'toaststunt', hostVerbs });
world.addVerb(42n, {
  names: 'echo', owner: 7n, perms: 'rx', args: ['none', 'none', 'none'],
  source: '', hostId: 'example.echo',
});
```

Snapshots save only the ID. Loading checks that registration without invoking or
deserializing the callback. Callbacks are synchronous and return managed MOO
values. They receive immutable args/frame metadata and explicit output, charging
and raise helpers. A world reference permits custom capabilities; default fixtures
use MOO source and need no registrations. Custom callbacks should charge costly
work. Use host.raise for intentional MOO errors. Other exceptions, invalid values,
async results and invalid charges are HostError failures. Limits cannot be caught
by MOO code. Successful set_verb_code replaces a host ID with validated MOO source.

Snapshots and Reset affect managed data only. External callback effects are not
reversible. Strong cancellation and discard-on-Stop use the
execution-worker adapter described in workers.md.
