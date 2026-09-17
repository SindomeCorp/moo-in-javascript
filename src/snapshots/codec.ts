import { validateEnvironment, type HostEnvironment } from '../host/environment.js';
import { assertProfile, HostError, type Profile } from '../parser/index.js';
import { World, type WorldLimits, type ObjectData, type PropertyData, type VerbData } from '../world/index.js';
import { encodeValue, decodeValue, type EncodedValue } from '../values/index.js';
import type { Diagnostic } from '../ast/source.js';

export interface SnapshotLimits { maxCharacters?: number; maxNodes?: number; maxDepth?: number }
export interface LoadWorldOptions { unsupportedSourcePolicy?: 'reject' | 'retain'; world?: World; worldLimits?: WorldLimits; limits?: SnapshotLimits }
export interface SnapshotCompiler {
  readonly profile: Profile;
  compile(source: string): { ok: true } | { ok: false; diagnostics: readonly Diagnostic[] };
  hasHostVerb(id: string): boolean;
}
export interface SnapshotObject {
  player?: boolean; location?: string; contents?: string[];
  id: string; parent: string; owner: string; name: string; flags: ObjectData['flags'];
  properties: { name: string; origin: string; owner: string; perms: string; value: EncodedValue | null }[];
  verbs: { names: string; owner: string; perms: string; args: readonly [string, string, string]; source?: string; hostId?: string }[];
}
export interface WorldSnapshot { environment?: HostEnvironment; version: 1; profile: Profile; nextId: string; objects: SnapshotObject[] }

function limitsFor(limits: SnapshotLimits = {}): Required<SnapshotLimits> {
  const result = { maxCharacters: limits.maxCharacters ?? 16_000_000, maxNodes: limits.maxNodes ?? 1_000_000, maxDepth: limits.maxDepth ?? 512 };
  for (const value of Object.values(result)) if (!Number.isSafeInteger(value) || value < 0) throw new HostError('Snapshot limits must be nonnegative safe integers');
  if (result.maxDepth > 1024) throw new HostError('Snapshot maxDepth cannot exceed 1024');
  return result;
}
function reject(message: string): never { throw new HostError('Invalid world snapshot: ' + message); }

/** Inspect plain data without reading accessors or following cycles. */
function checkJSON(input: unknown, limits: Required<SnapshotLimits>): void {
  const seen = new WeakSet<object>();
  const pending: { value: unknown; depth: number }[] = [{ value: input, depth: 0 }];
  let nodes = 0, characters = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) reject('JSON depth/node limit exceeded');
    if (typeof value === 'string') { characters += value.length; if (characters > limits.maxCharacters) reject('JSON string limit exceeded'); continue; }
    if (value === null || typeof value === 'boolean') continue;
    if (typeof value === 'number') { if (!Number.isFinite(value)) reject('non-finite JSON number'); continue; }
    if (!value || typeof value !== 'object') reject('only JSON data is accepted');
    if (seen.has(value)) reject('cyclic or shared object structure');
    seen.add(value);
    const array = Array.isArray(value);
    if ((!array && Object.getPrototypeOf(value) !== Object.prototype) || (array && Object.getPrototypeOf(value) !== Array.prototype)) reject('custom object prototypes are not accepted');
    if (array && value.length > limits.maxNodes - nodes) reject('array exceeds node limit');
    const keys = Reflect.ownKeys(value);
    if (keys.length > limits.maxNodes - nodes + (array ? 1 : 0)) reject('object exceeds node limit');
    if (array && keys.length !== value.length + 1) reject('sparse or extended arrays are not accepted');
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') reject('symbol keys are not accepted');
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) reject('accessor or hidden fields are not accepted');
      characters += key.length;
      if (characters > limits.maxCharacters) reject('JSON string limit exceeded');
      pending.push({ value: descriptor.value, depth: depth + 1 });
    }
  }
}

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('expected an object');
  const object = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(object, key)) || Object.keys(object).some(key => !required.includes(key) && !optional.includes(key))) reject('missing or unknown fields');
  return object;
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) reject('expected an array'); return value; }
function string(value: unknown): string { if (typeof value !== 'string') reject('expected a string'); return value; }
function decimal(value: unknown): bigint {
  const text = string(value);
  if (text.length > 20 || !/^(0|-?[1-9][0-9]*)$/.test(text)) reject('expected a canonical decimal ID');
  return BigInt(text);
}
function envelope(input: unknown, limits?: SnapshotLimits): Record<string, unknown> {
  const bounds = limitsFor(limits);
  let parsed = input;
  if (typeof input === 'string') {
    if (input.length > bounds.maxCharacters) reject('serialized character limit exceeded');
    try { parsed = JSON.parse(input); } catch (cause) { throw new HostError('Invalid snapshot JSON', { cause }); }
  }
  checkJSON(parsed, bounds);
  const data = record(parsed, ['version', 'profile', 'nextId', 'objects'], ['environment']);
  if (data.version !== 1) reject('unsupported or missing snapshot version');
  assertProfile(data.profile);
  return data;
}
export function snapshotProfile(input: unknown, limits?: SnapshotLimits): Profile { return envelope(input, limits).profile as Profile; }

export function worldSnapshot(world: World, limits?: SnapshotLimits): WorldSnapshot {
  world.assertIdle();
  const snapshot: WorldSnapshot = { ...(world.environment?{environment:structuredClone(world.environment)}:{}), version: 1, profile: world.profile, nextId: String(world.nextId), objects: world.objects().map(object => ({
    id: String(object.id), parent: String(object.parent), owner: String(object.owner), name: object.name, flags: { ...object.flags },
    ...(object.player === undefined ? {} : { player: object.player }),
    ...(object.location === undefined ? {} : { location: String(object.location) }),
    ...(object.contents === undefined ? {} : { contents: object.contents.map(String) }),
    properties: object.properties.map(prop => ({ name: prop.name, origin: String(prop.origin), owner: String(prop.owner), perms: prop.perms,
      value: prop.value === null ? null : encodeValue(prop.value, { profile: world.profile }) })),
    verbs: object.verbs.map(verb => ({ names: verb.names, owner: String(verb.owner), perms: verb.perms, args: [...verb.args],
      ...(verb.hostId === undefined ? { source: verb.source } : { hostId: verb.hostId }) })),
  })) };
  checkJSON(snapshot, limitsFor(limits));
  return snapshot;
}
export function saveWorld(world: World, limits?: SnapshotLimits): string {
  const snapshot = worldSnapshot(world, limits);
  const json = JSON.stringify(snapshot);
  if (json.length > limitsFor(limits).maxCharacters) reject('serialized character limit exceeded');
  return json;
}

export function decodeWorld(input: unknown, compiler: SnapshotCompiler, options: LoadWorldOptions = {}): World {
  if (options.unsupportedSourcePolicy !== undefined && !['reject','retain'].includes(options.unsupportedSourcePolicy)) reject('invalid unsupported source policy');
  options.world?.assertIdle();
  const data = envelope(input, options.limits), profile = data.profile as Profile;
  if (profile !== compiler.profile || (options.world && options.world.profile !== profile)) reject('snapshot, runtime and target profiles must match');
  const world = new World({ profile, limits: options.world?.limits ?? options.worldLimits ?? {} });
  const rawObjects = array(data.objects);
  if (rawObjects.length > world.limits.objects) reject('object limit exceeded');
  let properties = 0, verbs = 0;
  const objects: ObjectData[] = rawObjects.map(raw => {
    const object = record(raw, ['id', 'parent', 'owner', 'name', 'flags', 'properties', 'verbs'], ['player','location','contents']);
    if (object.player !== undefined && typeof object.player !== 'boolean') reject('player must be boolean');
    const flags = record(object.flags, ['programmer', 'wizard', 'r', 'w', 'f']);
    for (const flag of Object.values(flags)) if (flag !== 0 && flag !== 1) reject('flags must be zero or one');
    const rawProperties = array(object.properties), rawVerbs = array(object.verbs);
    properties += rawProperties.length; verbs += rawVerbs.length;
    if (properties > world.limits.properties || verbs > world.limits.verbs) reject('property/verb limit exceeded');
    const propertyRecords: PropertyData[] = rawProperties.map(rawProperty => {
      const property = record(rawProperty, ['name', 'origin', 'owner', 'perms', 'value']);
      return { name: string(property.name), origin: decimal(property.origin), owner: decimal(property.owner), perms: string(property.perms),
        value: property.value === null ? null : decodeValue(property.value, { profile }) };
    });
    const verbRecords: VerbData[] = rawVerbs.map(rawVerb => {
      const verb = record(rawVerb, ['names', 'owner', 'perms', 'args'], ['source', 'hostId']);
      if (Object.hasOwn(verb, 'source') === Object.hasOwn(verb, 'hostId')) reject('verb requires exactly one of source or hostId');
      const args = array(verb.args);
      if (args.length !== 3) reject('verb arguments require three strings');
      return { names: string(verb.names), owner: decimal(verb.owner), perms: string(verb.perms),
        args: [string(args[0]), string(args[1]), string(args[2])],
        ...(Object.hasOwn(verb, 'hostId') ? { source: '', hostId: string(verb.hostId) } : { source: string(verb.source) }) };
    });
    return { id: decimal(object.id), parent: decimal(object.parent), owner: decimal(object.owner), name: string(object.name),
      ...(object.player === undefined ? {} : { player: object.player as boolean }),
      ...(object.location === undefined ? {} : { location: decimal(object.location) }),
      ...(object.contents === undefined ? {} : { contents: array(object.contents).map(decimal) }),
      flags: flags as unknown as ObjectData['flags'], properties: propertyRecords, verbs: verbRecords };
  });
  if(data.environment!==undefined)validateEnvironment(data.environment);
  world.restore(objects, decimal(data.nextId), data.environment);
  for (const object of world.objects()) for (const verb of object.verbs) {
    if (verb.hostId !== undefined) {
      if (!compiler.hasHostVerb(verb.hostId)) reject('host verb registration is unavailable: ' + verb.hostId);
    } else {
      const result = compiler.compile(verb.source);
      if (!result.ok && !(options.unsupportedSourcePolicy === 'retain' && result.diagnostics.every(d => d.category === 'unsupported-feature'))) reject('verb #' + object.id + ':' + verb.names + ' does not compile: ' + result.diagnostics.map(diagnostic => diagnostic.message).join('; '));
    }
  }
  if (options.world) { options.world.replaceWith(world); return options.world; }
  return world;
}
