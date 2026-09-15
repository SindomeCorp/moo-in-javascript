import { assertProfile, HostError, type Profile } from '../parser/index.js';
import { moo, encodeValue, type MooValue } from '../values/index.js';
import { fold, truth } from '../values/operations.js';
import { fail, LimitError } from '../runtime/errors.js';
import type { Budget } from '../runtime/budget.js';

export interface PropertyData { readonly name: string; readonly origin: bigint; readonly owner: bigint; readonly perms: string; readonly value: MooValue | null }
export interface VerbData { readonly names: string; readonly owner: bigint; readonly perms: string; readonly args: readonly [string, string, string]; readonly source: string; readonly hostId?: string }
export interface ObjectData {
  readonly id: bigint; readonly parent: bigint; readonly name: string; readonly owner: bigint;
  readonly flags: Readonly<{ programmer: number; wizard: number; r: number; w: number; f: number }>;
  readonly properties: readonly PropertyData[]; readonly verbs: readonly VerbData[];
}
export type WorldChange = { kind: 'object-created'; object: bigint; after: ObjectData }
  | { kind: 'object-updated'; object: bigint; before: ObjectData; after: ObjectData }
  | { kind: 'object-recycled'; object: bigint; before: ObjectData }
  | { kind: 'allocation-state'; before: bigint; after: bigint };
export interface WorldLimits { objects?: number; properties?: number; verbs?: number; valueNodes?: number; stringUnits?: number; inheritanceDepth?: number }
const builtinNames = new Set(['name', 'owner', 'location', 'contents', 'programmer', 'wizard', 'r', 'w', 'f']);
export const prepositionGroups = ['with/using', 'at/to', 'in front of', 'in/inside/into', 'on top of/on/onto/upon', 'out of/from inside/from', 'over', 'through', 'under/underneath/beneath', 'behind', 'beside', 'for/about', 'is', 'as', 'off/off of'] as const;
export function verbMatches(names: string, sought: string): boolean {
  const name = fold(sought);
  return names.split(/\s+/).some(pattern => {
    pattern = fold(pattern); const at = pattern.indexOf('*');
    if (at < 0) return pattern === name;
    const full = pattern.replace('*', '');
    return name.length >= at && full.startsWith(name);
  });
}
function freezeObject(data: ObjectData): ObjectData {
  return Object.freeze({ ...data, flags: Object.freeze({ ...data.flags }),
    properties: Object.freeze(data.properties.map(property => Object.freeze({ ...property }))),
    verbs: Object.freeze(data.verbs.map(verb => Object.freeze({ ...verb, args: Object.freeze([...verb.args]) as readonly [string, string, string] }))),
  });
}

export function createWorld(options: { profile: Profile; limits?: WorldLimits }): World { return new World(options); }
export class World {
  readonly profile: Profile;
  readonly limits: Required<WorldLimits>;
  #objects = new Map<bigint, ObjectData>();
  #nextId = 0n;
  #executing = false;
  #isolated = false;
  constructor(options: { profile: Profile; limits?: WorldLimits }) {
    assertProfile(options?.profile); this.profile = options.profile;
    this.limits = Object.freeze({ objects: 1000, properties: 10_000, verbs: 10_000, valueNodes: 100_000,
      stringUnits: 1_000_000, inheritanceDepth: 100, ...options.limits });
    for (const limit of Object.values(this.limits)) if (!Number.isSafeInteger(limit) || limit < 0) throw new HostError('World limits must be nonnegative safe integers');
    if (this.limits.inheritanceDepth > 256) throw new HostError('World inheritanceDepth cannot exceed 256');
  }
  get nextId(): bigint { return this.#nextId; }
  assertIdle(): void { if (this.#executing) throw new HostError('World save/load/reset must occur between executions'); }
  /** Import managed records after validation; replacement is atomic. */
  restore(records: readonly ObjectData[], nextId: bigint): void {
    this.assertIdle();
    const maximum = (1n << (this.profile === 'lambdamoo' ? 31n : 63n)) - 1n;
    if (typeof nextId !== 'bigint' || nextId < 0n || nextId > maximum + 1n) throw new HostError('Invalid nextId allocation state');
    if (records.length > this.limits.objects) throw new HostError('Snapshot object limit exceeded');
    const ids = new Map<bigint, ObjectData>();
    for (const record of records) {
      if (typeof record.id !== 'bigint' || record.id < 0n || record.id >= nextId || ids.has(record.id)) throw new HostError('Invalid or duplicate object ID');
      for (const id of [record.id, record.parent, record.owner]) encodeValue(moo.object(id), { profile: this.profile });
      if (typeof record.name !== 'string') throw new HostError('Invalid object name');
      if (Object.keys(record.flags).sort().join(',') !== 'f,programmer,r,w,wizard' || Object.values(record.flags).some(value => value !== 0 && value !== 1)) throw new HostError('Invalid object flags');
      const names = new Set<string>();
      for (const property of record.properties) {
        if (typeof property.name !== 'string' || names.has(fold(property.name)) || builtinNames.has(fold(property.name))) throw new HostError('Duplicate or reserved property name');
        names.add(fold(property.name));
        if (typeof property.perms !== 'string' || /[^rwc]/.test(property.perms)) throw new HostError('Invalid property permissions');
        encodeValue(moo.object(property.owner), { profile: this.profile });
        if (typeof property.origin !== 'bigint') throw new HostError('Invalid property origin');
        if (property.value !== null) this.validateValue(property.value);
      }
      for (const verb of record.verbs) {
        encodeValue(moo.object(verb.owner), { profile: this.profile });
        validateVerbShape(verb);
      }
      ids.set(record.id, record);
    }
    for (const record of records) {
      const ancestors = new Set<bigint>();
      let current: ObjectData | undefined = record;
      while (current) {
        if (ancestors.has(current.id)) throw new HostError('Snapshot inheritance cycle');
        ancestors.add(current.id);
        if (ancestors.size > this.limits.inheritanceDepth) throw new HostError('Snapshot inheritance depth exceeded');
        if (current.parent === -1n) break;
        current = ids.get(current.parent);
        if (!current) throw new HostError('Snapshot has a missing parent');
      }
      const parent = ids.get(record.parent);
      const inherited = new Map(parent?.properties.map(property => [fold(property.name), property]) ?? []);
      for (const property of record.properties) {
        const name = fold(property.name), source = inherited.get(name);
        if (property.origin === record.id) {
          if (source || property.value === null) throw new HostError('Invalid directly defined property');
        } else if (!source || source.origin !== property.origin || !ancestors.has(property.origin)) {
          throw new HostError('Invalid inherited property origin');
        }
        inherited.delete(name);
      }
      if (inherited.size) throw new HostError('Snapshot is missing inherited property slots');
    }
    const candidate = new World({ profile: this.profile, limits: this.limits });
    try { candidate.commit([...records], [], nextId); }
    catch (cause) { throw new HostError('Snapshot world limits exceeded', { cause }); }
    this.#objects = candidate.#objects; this.#nextId = candidate.#nextId;
  }
  replaceWith(world: World): void {
    this.assertIdle(); world.assertIdle();
    if (this.profile !== world.profile) throw new HostError('World profiles must match when replacing state');
    this.restore(world.objects(), world.nextId);
  }
  acquireExecution(): () => void {
    if (this.#executing) throw new HostError('Executions on one world must be serialized');
    this.#executing = true;
    return () => { this.#executing = false; };
  }
  /** Reserve committed state while a separate worker owns a working copy. */
  acquireIsolation(): () => void {
    const release = this.acquireExecution();
    this.#isolated = true;
    return () => { this.#isolated = false; release(); };
  }
  objects(): readonly ObjectData[] { return Object.freeze([...this.#objects.values()]); }
  valid(id: bigint): boolean { return this.#objects.has(id); }
  get(id: bigint, indirect = false): ObjectData { return this.#objects.get(id) ?? fail(indirect ? 'E_INVIND' : 'E_INVARG', `Object #${id} does not exist`); }
  changes(before: readonly ObjectData[], beforeNextId?: bigint): WorldChange[] {
    const previous = new Map(before.map(object => [object.id, object]));
    const changes: WorldChange[] = [];
    for (const object of this.#objects.values()) {
      const old = previous.get(object.id); previous.delete(object.id);
      if (!old) changes.push({ kind: 'object-created', object: object.id, after: object });
      else if (old !== object) changes.push({ kind: 'object-updated', object: object.id, before: old, after: object });
    }
    for (const object of previous.values()) changes.push({ kind: 'object-recycled', object: object.id, before: object });
    if (beforeNextId !== undefined && beforeNextId !== this.#nextId) changes.push({ kind: 'allocation-state', before: beforeNextId, after: this.#nextId });
    return changes;
  }
  ancestors(id: bigint, budget?: Budget): ObjectData[] {
    const result: ObjectData[] = [], seen = new Set<bigint>();
    while (id !== -1n) {
      budget?.step();
      if (seen.has(id)) throw new HostError('World inheritance cycle');
      if (result.length >= this.limits.inheritanceDepth) throw new LimitError('inheritanceDepth');
      const object = this.get(id); seen.add(id); result.push(object); id = object.parent;
    }
    return result;
  }
  children(id: bigint): ObjectData[] { this.get(id); return [...this.#objects.values()].filter(object => object.parent === id); }
  private descendants(id: bigint, budget?: Budget): ObjectData[] {
    this.get(id);
    return [...this.#objects.values()].filter(object => this.ancestors(object.id, budget).some(ancestor => ancestor.id === id));
  }
  private commit(updates: ObjectData[], removals: bigint[] = [], nextId = this.#nextId, budget?: Budget): void {
    if (this.#isolated) throw new HostError('World mutations must wait for the isolated execution');
    const objects = new Map(this.#objects);
    for (const id of removals) objects.delete(id);
    for (const update of updates) objects.set(update.id, freezeObject(update));
    let properties = 0, verbs = 0, nodes = 0, strings = 0;
    if (objects.size > this.limits.objects) throw new LimitError('worldObjects');
    for (const object of objects.values()) {
      budget?.step(); properties += object.properties.length; verbs += object.verbs.length; strings += object.name.length;
      for (const verb of object.verbs) strings += verb.names.length + verb.perms.length + verb.source.length;
      for (const prop of object.properties) {
        strings += prop.name.length + prop.perms.length;
        if (prop.value) {
          const pending: MooValue[] = [prop.value];
          while (pending.length) {
            budget?.step(); nodes++; const value = pending.pop()!;
            if (nodes > this.limits.valueNodes) throw new LimitError('worldValues');
            if (value.type === 'string') strings += value.value.length;
            else if (value.type === 'list') for (const item of value.value) pending.push(item);
            else if (value.type === 'map') for (const pair of value.value) pending.push(...pair);
          }
        }
      }
      if (properties > this.limits.properties || verbs > this.limits.verbs || strings > this.limits.stringUnits) throw new LimitError('worldSize');
    }
    budget?.allocate(updates.reduce((sum, object) => sum + 1 + object.properties.length + object.verbs.length, 0));
    this.#objects = objects; this.#nextId = nextId;
  }
  private validateValue(value: MooValue, budget?: Budget): void {
    try { encodeValue(value, { profile: this.profile }); }
    catch (error) {
      if (budget && error instanceof HostError) throw new LimitError('worldValueEncoding');
      throw error;
    }
  }
  addObject(options: { id?: bigint | number; parent?: bigint | number; owner?: bigint | number; name?: string }, budget?: Budget): bigint {
    for (const value of [options.id, options.parent, options.owner]) if (value !== undefined && typeof value !== 'bigint' && (typeof value !== 'number' || !Number.isSafeInteger(value))) throw new HostError('Object IDs must be BigInt or safe integers');
    if (options.name !== undefined && typeof options.name !== 'string') throw new HostError('Object name must be a string');
    const id = options.id === undefined ? this.#nextId : BigInt(options.id), parent = BigInt(options.parent ?? -1), owner = BigInt(options.owner ?? id);
    if (id < this.#nextId || id < 0n || this.valid(id)) fail('E_INVARG', 'Object IDs cannot be reused or allocated below nextId');
    this.validateValue(moo.object(id), budget);
    if (owner !== id && !this.valid(owner)) fail('E_INVARG', 'Invalid owner');
    const ancestors = parent === -1n ? [] : this.ancestors(parent, budget);
    if (ancestors.length >= this.limits.inheritanceDepth) throw new LimitError('inheritanceDepth');
    const properties = ancestors[0]?.properties.map(prop => ({ ...prop, value: null, owner: prop.perms.includes('c') ? owner : prop.owner })) ?? [];
    this.commit([{ id, parent, owner, name: options.name ?? '', flags: { programmer: 0, wizard: 0, r: 0, w: 0, f: 0 }, properties, verbs: [] }], [], id + 1n, budget);
    return id;
  }
  recycle(id: bigint, budget?: Budget): void {
    const object = this.get(id), updates: ObjectData[] = [];
    for (const descendant of this.descendants(id, budget)) if (descendant.id !== id) {
      updates.push({ ...descendant, parent: descendant.parent === id ? object.parent : descendant.parent,
        properties: descendant.properties.filter(property => property.origin !== id) });
    }
    this.commit(updates, [id], this.#nextId, budget);
  }
  property(id: bigint, name: string, budget?: Budget): PropertyData {
    const properties = this.get(id).properties;
    budget?.step(properties.reduce((sum, prop) => sum + prop.name.length + 1, name.length));
    return properties.find(property => fold(property.name) === fold(name)) ?? fail('E_PROPNF', `Property ${name} does not exist on #${id}`);
  }
  getProperty(id: bigint, name: string, budget?: Budget): MooValue {
    const object = this.get(id, true), key = fold(name);
    if (key === 'name') return moo.string(object.name);
    if (key === 'owner') return moo.object(object.owner);
    if (key === 'location') return moo.object(-1);
    if (key === 'contents') return moo.list([]);
    if (Object.hasOwn(object.flags, key)) return moo.int(object.flags[key as keyof ObjectData['flags']]);
    for (const ancestor of this.ancestors(id, budget)) {
      budget?.step(ancestor.properties.reduce((sum, prop) => sum + prop.name.length + 1, name.length));
      const property = ancestor.properties.find(p => fold(p.name) === key);
      if (!property) break;
      if (property.value !== null) return property.value;
    }
    return fail('E_PROPNF', `Property ${name} does not exist on #${id}`);
  }
  setProperty(id: bigint, name: string, value: MooValue, budget?: Budget): void {
    const object = this.get(id, true), key = fold(name);
    this.validateValue(value, budget);
    let update: ObjectData;
    if (key === 'location' || key === 'contents') fail('E_PERM', 'Movement is not supported; containment properties are read-only');
    if (key === 'name') { if (value.type !== 'string') fail('E_TYPE'); update = { ...object, name: value.value }; }
    else if (key === 'owner') { if (value.type !== 'object') fail('E_TYPE'); if (!this.valid(value.value)) fail('E_INVARG'); update = { ...object, owner: value.value }; }
    else if (Object.hasOwn(object.flags, key)) {
      if (value.type !== 'int') fail('E_TYPE');
      update = { ...object, flags: { ...object.flags, [key]: truth(value) ? 1 : 0 } };
    } else {
      this.property(id, name, budget);
      update = { ...object, properties: object.properties.map(prop => fold(prop.name) === key ? { ...prop, value } : prop) };
    }
    this.commit([update], [], this.#nextId, budget);
  }
  addProperty(id: bigint, name: string, value: MooValue, owner: bigint, perms: string, budget?: Budget): void {
    this.validateValue(value, budget); this.get(owner);
    if (/[^rwc]/i.test(perms)) fail('E_INVARG'); perms = fold(perms);
    const descendants = this.descendants(id, budget), key = fold(name);
    if (builtinNames.has(key) || descendants.some(object => object.properties.some(prop => fold(prop.name) === key))) fail('E_INVARG', 'Property name conflicts with an existing definition');
    this.commit(descendants.map(object => ({ ...object, properties: [...object.properties, { name, origin: id,
      owner: object.id !== id && perms.includes('c') ? object.owner : owner, perms, value: object.id === id ? value : null }] })), [], this.#nextId, budget);
  }
  deleteProperty(id: bigint, name: string, budget?: Budget): void {
    const property = this.property(id, name); if (property.origin !== id) fail('E_PROPNF');
    this.commit(this.descendants(id, budget).map(object => ({ ...object, properties: object.properties.filter(prop => fold(prop.name) !== fold(name)) })), [], this.#nextId, budget);
  }
  clearProperty(id: bigint, name: string, budget?: Budget): void {
    const object = this.get(id), property = this.property(id, name);
    if (property.origin === id) fail('E_INVARG', 'Cannot clear a property at its definition');
    this.commit([{ ...object, properties: object.properties.map(prop => prop === property ? { ...prop, value: null } : prop) }], [], this.#nextId, budget);
  }
  setPropertyInfo(id: bigint, name: string, owner: bigint, perms: string, newName: string | undefined, budget?: Budget): void {
    this.get(owner); const property = this.property(id, name);
    if (/[^rwc]/i.test(perms)) fail('E_INVARG'); perms = fold(perms);
    const objects = newName === undefined ? [this.get(id)] : this.descendants(id, budget);
    if (newName !== undefined && (property.origin !== id || builtinNames.has(fold(newName)) || objects.some(object => object.properties.some(p => fold(p.name) === fold(newName) && fold(p.name) !== fold(name))))) fail('E_INVARG');
    this.commit(objects.map(object => ({ ...object, properties: object.properties.map(prop => fold(prop.name) === fold(name)
      ? { ...prop, name: newName ?? prop.name, ...(object.id === id ? { owner, perms } : {}) } : prop) })), [], this.#nextId, budget);
  }
  ownVerb(id: bigint, descriptor: string | bigint): { object: ObjectData; verb: VerbData; index: number } {
    const object = this.get(id);
    const index = typeof descriptor === 'bigint' ? Number(descriptor - 1n) : object.verbs.findIndex(verb => verbMatches(verb.names, descriptor));
    const verb = object.verbs[index]; if (!verb) fail('E_VERBNF'); return { object, verb, index };
  }
  findVerb(id: bigint, name: string, budget?: Budget): { definer: bigint; verb: VerbData } | undefined {
    for (const object of this.ancestors(id, budget)) {
      budget?.step(object.verbs.reduce((sum, verb) => sum + verb.names.length + 1, name.length));
      const verb = object.verbs.find(v => verbMatches(v.names, name));
      if (verb) return { definer: object.id, verb };
    }
    return undefined;
  }
  addVerb(id: bigint, verb: VerbData, budget?: Budget): void {
    const object = this.get(id); this.validateVerb(verb);
    this.commit([{ ...object, verbs: [...object.verbs, verb] }], [], this.#nextId, budget);
  }
  setVerb(id: bigint, descriptor: string | bigint, patch: Partial<VerbData>, budget?: Budget): void {
    const { object, verb, index } = this.ownVerb(id, descriptor), replacement = { ...verb, ...patch };
    if (Object.hasOwn(patch, 'source') && !Object.hasOwn(patch, 'hostId')) delete replacement.hostId;
    this.validateVerb(replacement);
    this.commit([{ ...object, verbs: object.verbs.map((v, i) => i === index ? replacement : v) }], [], this.#nextId, budget);
  }
  deleteVerb(id: bigint, descriptor: string | bigint, budget?: Budget): void {
    const { object, index } = this.ownVerb(id, descriptor);
    this.commit([{ ...object, verbs: object.verbs.filter((_, i) => i !== index) }], [], this.#nextId, budget);
  }
  private validateVerb(verb: VerbData): void {
    this.get(verb.owner);
    try { validateVerbShape(verb); }
    catch (error) { if (error instanceof HostError) fail('E_INVARG', error.message); throw error; }
  }
}

function validateVerbShape(verb: VerbData): void {
  if (typeof verb.names !== 'string' || !verb.names.trim() || typeof verb.perms !== 'string' || /[^rwxd]/.test(verb.perms)) throw new HostError('Invalid verb metadata');
  if (!Array.isArray(verb.args) || verb.args.length !== 3 || !['this', 'none', 'any'].includes(verb.args[0]) || !['this', 'none', 'any'].includes(verb.args[2])) throw new HostError('Invalid verb arguments');
  if (!['none', 'any', ...prepositionGroups.flatMap(group => group.split('/'))].includes(verb.args[1])) throw new HostError('Invalid verb preposition');
  if (typeof verb.source !== 'string') throw new HostError('Verb source must be a string');
  if (verb.hostId !== undefined && (typeof verb.hostId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(verb.hostId) || verb.source !== '')) throw new HostError('Host verbs require a stable ID and empty source');
}
