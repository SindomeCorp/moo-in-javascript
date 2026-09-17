import { serviceBuiltins } from './services.js';
import { sqliteBuiltins } from './sqlite.js';
import { connectionBuiltins } from './connections.js';
import { fileBuiltins } from './files.js';
import { clockBuiltins } from './clock.js';
import { cryptoBuiltins } from './crypto.js';
import { regexBuiltins } from './regex.js';
import { codecs } from './codecs.js';
import { utilities } from './utilities.js';
import { assertProfile, HostError, type Profile } from '../parser/index.js';
import type { MooValue } from '../values/index.js';
import { fail } from '../runtime/errors.js';

export type BuiltinValueType = MooValue['type'] | 'any';
export interface BuiltinParameter {
  readonly name: string;
  readonly types: readonly BuiltinValueType[];
  readonly description: string;
  readonly optional: boolean;
}
export interface BuiltinInfo {
  readonly name: string;
  readonly summary: string;
  readonly notes: readonly string[];
  readonly minArgs: number;
  /** null means unlimited. */
  readonly maxArgs: number | null;
  readonly parameters: readonly BuiltinParameter[];
  readonly rest?: BuiltinParameter;
  readonly returns: { readonly types: readonly (BuiltinValueType | 'never')[]; readonly description: string };
}
export interface BuiltinCatalogOptions { profile: Profile }
type Route = 'core' | 'world' | 'special';
const parameter = (name: string, types: BuiltinValueType | BuiltinValueType[], description: string, optional = false): BuiltinParameter =>
  ({ name, types: Array.isArray(types) ? types : [types], description, optional });
const result = (types: BuiltinValueType | 'never', description: string): BuiltinInfo['returns'] => ({ types: [types], description });
const object = () => parameter('object', 'object', 'Object to inspect or modify.');
const descriptor = () => parameter('descriptor', ['string', 'int'], 'Local verb name or one-based verb number.');
const propertyName = () => parameter('name', 'string', 'Property name.');
const zero = () => result('int', 'Returns 0 on success.');
const metadata = (description: string) => parameter('info', 'list', description);
const value = () => parameter('value', 'any', 'MOO value.');
const nameKey = (name: string) => name.replace(/[A-Z]/g, c => c.toLowerCase());
function freeze<T>(input: T): T {
  if (input && typeof input === 'object' && !Object.isFrozen(input)) {
    for (const child of Object.values(input)) freeze(child);
    Object.freeze(input);
  }
  return input;
}
function build(profile: Profile) {
  const entries = new Map<string, { info: BuiltinInfo; route: Route }>();
  const add = (name: string, route: Route, parameters: BuiltinParameter[], returns: BuiltinInfo['returns'], summary: string, notes: string[] = [], rest?: BuiltinParameter) => {
    if (entries.has(name)) throw new HostError('Duplicate builtin catalog entry: ' + name);
    const info = freeze({ name, summary, notes, parameters, returns, minArgs: parameters.filter(p => !p.optional).length,
      maxArgs: rest ? null : parameters.length, ...(rest ? { rest } : {}) });
    entries.set(name, { info, route });
  };
  add('length', 'core', [parameter('value', profile === 'toaststunt' ? ['string','list','map'] : ['string','list'], 'String, list or supported map.')], result('int', 'Number of UTF-16 string units, list elements or map entries.'), 'Measure a collection.');
  add('typeof', 'core', [value()], result('int', 'MOO type code.'), 'Identify a value’s type.');
  add('value_bytes', 'core', [value()], result('int', 'Always returns 0; this is a fixed placeholder, not a byte count.'), 'Stub: value memory accounting is unavailable.', ['Accepts any supported MOO value without inspecting its size or dereferencing object references.']);
  add('object_bytes', 'world', [object()], result('int', 'Returns the fixed placeholder 0 for an existing object, not its memory size.'), 'Stub: object memory accounting is unavailable.', ['Requires an object reference to an existing object; invalid references raise E_INVIND. Native wizard permission checks are not enforced.']);
  add('equal', 'core', [parameter('left','any','First value.'),parameter('right','any','Second value.')], result('int','1 if equal, otherwise 0; string comparisons are case-sensitive.'), 'Compare values recursively and case-sensitively.');
  add('tostr', 'core', [], result('string','Concatenated display forms; lists/maps use collection summaries.'), 'Join display forms of values.', [], parameter('values','any','Values to format in order.'));
  add('toliteral','core',[value()],result('string','MOO literal-style representation.'),'Format a value as MOO text.', ['Extended host strings may not be valid portable source literals; use the JSON codec for persistence.']);
  add('raise','core',[parameter('code','error','Error to raise.'),parameter('message','string','Error message; defaults to the standard message.',true),parameter('value','any','Value attached to the error; defaults to 0.',true)],result('never','Raises a MOO error; never returns normally.'),'Raise a catchable MOO error.');
  for (const name of ['index','rindex']) {
    const args = [parameter('source','string','String to search.'),parameter('needle','string','Substring to find.'),parameter('caseMatters','any','Truthy values enable case-sensitive comparison.',true)];
    if (profile === 'toaststunt') args.push(parameter('offset','int',name === 'index' ? 'Nonnegative prefix length to skip; returned position is relative to the suffix.' : 'Nonpositive amount by which to shorten the search prefix.',true));
    add(name,'core',args,result('int','One-based match position, or 0 when absent.'),name === 'index' ? 'Find the first substring occurrence.' : 'Find the last substring occurrence.', ['Default comparison folds ASCII case.']);
  }
  add('notify','world',[parameter('recipient','object','Existing recipient object.'),parameter('text','string','Text to emit.')],result('int','Returns 1 after emitting an output event.'),'Emit text to the host output callback.', ['Does not require or create a network connection.']);
  add('valid','world',[object()],result('int','1 for an existing object, otherwise 0.'),'Check whether an object exists.');
  add('parent','world',[object()],result('object','Parent object, or #-1.'),'Read an object’s parent.');
  add('children','world',[object()],result('list','Direct child object references.'),'List direct children.');
  add('max_object','world',[],result('object','Highest allocated object ID; includes recycled IDs, or #-1 for an empty world.'),'Read the object allocation high-water mark.');
  add('create','world',[parameter('parent','object','Parent object, or #-1 for no parent.'),parameter('owner','object','Owner; defaults to the current programmer, with #-1 selecting self ownership.',true)],result('object','Newly allocated object.'),'Create an object.', ['Permission enforcement and ownership quotas are not implemented. Calls initialize() after allocation when defined; initialization errors retain the created object.']);
  add('recycle','world',[object()],zero(),'Delete an object and reparent its children.', ['recycle hooks are rejected before mutation.']);
  add('properties','world',[object()],result('list','Names of properties defined directly on the object.'),'List local property definitions.');
  add('property_info','world',[object(),propertyName()],result('list','{owner, permissions} for the property.'),'Read property metadata.');
  add('set_property_info','world',[object(),propertyName(),metadata('{owner, permissions [, newName]}.')],zero(),'Update property metadata.', ['Renaming is permitted at the defining object. Permission bits are stored without enforcement.']);
  add('add_property','world',[object(),propertyName(),parameter('initial','any','Initial property value.'),metadata('{owner, permissions}.')],zero(),'Define a property and inherited slots.');
  add('delete_property','world',[object(),propertyName()],zero(),'Delete a local property definition and inherited slots.');
  add('clear_property','world',[object(),propertyName()],zero(),'Clear an inherited property override.', ['A property cannot be cleared on its defining object.']);
  add('is_clear_property','world',[object(),propertyName()],result('int','1 for a clear inherited slot, otherwise 0.'),'Check whether a property inherits its value.');
  add('verbs','world',[object()],result('list','Names/aliases for verbs defined directly on the object.'),'List local verbs.');
  add('add_verb','world',[object(),metadata('{owner, permissions, names}.'),parameter('args','list','{directObject, preposition, indirectObject}.')],zero(),'Define an initially empty verb.', ['Permission bits and command argument metadata are stored without enforcing permissions or dispatching commands.']);
  add('delete_verb','world',[object(),descriptor()],zero(),'Delete a local verb.');
  add('verb_info','world',[object(),descriptor()],result('list','{owner, permissions, names}.'),'Read verb metadata.');
  add('set_verb_info','world',[object(),descriptor(),metadata('{owner, permissions, names}.')],zero(),'Update verb metadata.', ['Permission bits are stored without enforcement.']);
  add('verb_args','world',[object(),descriptor()],result('list','{directObject, preposition, indirectObject}, with canonical preposition aliases.'),'Read verb argument specifications.');
  add('set_verb_args','world',[object(),descriptor(),parameter('args','list','{directObject, preposition, indirectObject}.')],zero(),'Update verb argument specifications.', ['Does not implement command dispatch.']);
  add('verb_code','world',[object(),descriptor(),parameter('fullyParenthesize','int','Only 0 is supported.',true),parameter('indent','int','Only 0 is supported.',true)],result('list','Stored MOO source lines.'),'Read verb source.', ['Pretty-print options are not implemented; nonzero values raise E_INVARG.']);
  add('set_verb_code','world',[object(),descriptor(),parameter('lines','list','List of source strings.')],result('list','Empty list on success; compilation messages on failure, preserving previous code.'),'Compile and replace verb source.');
  add('pass','special',[],result('any','Value returned by the inherited verb.'),'Call the current verb on an ancestor definition.', ['Requires a defined verb frame; otherwise raises E_VERBNF.'],parameter('args','any','Arguments passed to the inherited verb.'));
  if (profile === 'toaststunt') {
    const map = () => parameter('map','map','Map to inspect or modify.');
    const scalar: BuiltinValueType[] = ['int','float','string','object','error'];
    add('mapkeys','core',[map()],result('list','Keys in map order.'),'List map keys.');
    add('mapvalues','core',[map()],result('list','All values in map order, or values for the requested keys in argument order.'),'List map values.', ['Requested keys use case-sensitive matching; absent keys raise E_RANGE.'],parameter('keys',scalar,'Optional keys whose values are requested.'));
    add('maphaskey','core',[map(),parameter('key',scalar,'Key to look up.'),parameter('caseMatters','int','Nonzero enables case-sensitive matching.',true)],result('int','1 if the key exists, otherwise 0.'),'Check for a map key.');
    add('mapdelete','core',[map(),parameter('key',[...scalar,'list'],'Scalar key or list of scalar keys to remove.')],result('map','New map with the requested keys removed.'),'Remove map entries.', ['Missing keys raise E_RANGE.']);
  }
    add('renumber','world',[object()],result('object','New ID, or unchanged ID if no smaller gap exists.'),'Move an object to the first available lower ID.',['Repairs inheritance, containment and owner metadata. Arbitrary property values, source text, active frames and virtual connections retain their previous numeric references. Wizard checks are not enforced.']);
    add('reset_max_object','world',[],result('int','0.'),'Lower the allocation high-water mark to the highest surviving object.',['Subsequent create() calls can reuse removed trailing IDs; stored dangling references are unchanged. Wizard checks are not enforced.']);
  add('players','world',[],result('list','Objects with their player flag set, in ID order.'),'List player objects.');
  add('is_player','world',[object()],result('int','1 for a valid player object, otherwise 0.'),'Inspect an object’s player flag.');
  add('set_player_flag','world',[object(),parameter('flag','any','Truthiness sets or clears the flag.')],result('int','0.'),'Set an object’s player flag.',['Wizard checks and connection booting are not enforced.']);
  add('chparent','world',[object(),parameter('parent','object','New parent, or #-1.')],result('int','0.'),'Change a single parent and rebuild inherited property slots.',['Checks cycles and conflicting definitions; general object permissions are not enforced.']);
  add('move','world',[object(),parameter('destination','object','Destination, or #-1.'),...(profile==='toaststunt'?[parameter('position','int','Contents position; 0 appends.',true)]:[])],result('int','0.'),'Move an object, calling accept, exitfunc and enterfunc hooks.',['General object permissions are not enforced. Destination acceptance is required unless the programmer is a wizard.']);
  add('set_task_perms','world',[object()],result('int','0.'),'Change the current frame programmer.',['Only a wizard may switch to a different identity. General world operations do not yet enforce these permissions.']);
  add('call_function','world',[parameter('name','string','Builtin name.')],result('any','Result of the requested builtin.'),'Call a builtin by name.',[],parameter('args','any','Arguments forwarded to the builtin.'));
  add('eval','world',[parameter('source','string','MOO source line.')],result('list','{1, value} on success or {0, compilation messages}.'),'Compile and execute MOO source in a fresh local scope.',['Uses the current world and budgets; programmer permission checks are not enforced.'],parameter('lines','string','Additional source lines.'));
  add('callers','world',[parameter('includeLines','any','Include source line numbers.',true)],result('list','Caller frames, nearest first.'),'Inspect the current call stack.');
  add('suspend','world',[parameter('seconds', profile === 'toaststunt' ? ['int','float'] : 'int', 'Nonnegative delay, capped at five seconds.')],result('int','Zero after resuming.'),'Pause this task for up to five seconds, then replenish its execution budget.',['Requires asynchronous execution or a worker. Delay is capped at five seconds per call, with at most 100 suspensions per run. No indefinite suspend(), resume(), or multi-task scheduler. LambdaMOO accepts integer seconds; ToastStunt also accepts floats. Allocation and output budgets remain cumulative.']);
  add('ticks_left','world',[],result('int','Remaining interpreter step budget.'),'Inspect remaining execution steps.',['Interpreter steps are not native server bytecode ticks.']);
  add('task_id','world',[],result('int','Numeric run identifier, scoped to a runtime instance.'),'Identify the current execution.');
  for (const name of ['task_perms','caller_perms']) add(name,'world',[],result('object','Programmer of the current or calling frame.'),'Inspect frame programmer identity.',['Reports identity; this educational runtime does not enforce general world permissions.']);
  if (profile === 'toaststunt') {
    add('recreate','world',[object(),parameter('parent','object','Single parent, or #-1.'),parameter('owner','object','Defaults to the current programmer.',true)],result('object','Recreated object with its old ID.'),'Recreate a recycled or skipped object number.',['Permission checks and ownership quotas are not enforced. The number must be greater than 0 and below nextId. Calls initialize when present.']);
    add('occupants','world',[parameter('objects','list','Objects to filter.'),parameter('parents',['object','list'],'Required ancestor or candidate list.',true),parameter('playersOnly','int','Filter player objects.',true),parameter('invertParents','int','Invert the ancestor test.',true)],result('list','Objects matching the filters.'),'Filter object lists by ancestry and player flag.');
    add('locations','world',[object(),parameter('stopAt','object','Stop before this location; #0 disables the stop condition.',true),parameter('checkParent','int','Match descendants of stopAt.',true)],result('list','Containing locations, from nearest outward.'),'Inspect nested containment.');
    add('recycled_objects','world',[],result('list','Unallocated IDs below nextId, including skipped IDs.'),'List unused object numbers.');
    add('next_recycled_object','world',[parameter('start','object','First ID to consider.',true)],result('any','First unused ID, or integer 0 if none.'),'Find an unused object number.',['Includes the highest allocated ID when recycled. Object creation still allocates monotonically.']);
    add('task_local','world',[],result('any','Task-local value, initially 0.'),'Read data shared by frames in this run.');
    add('set_task_local','world',[value()],result('int','0.'),'Set data shared by frames in this run.');
    add('parents','world',[object()],result('list','Zero or one parent.'),'List the object’s parent.',['Multiple inheritance is deliberately unsupported.']);
    for (const name of ['ancestors','descendants']) add(name,'world',[object(),parameter('includeSelf','any','Include the queried object.',true)],result('list','Related objects.'),'List '+name+' in the inheritance tree.');
    add('isa','world',[object(),parameter('ancestors',['object','list'],'Ancestor or candidate ancestor list.'),parameter('returnObject','int','Return the matching ancestor instead of 1.',true)],result('any','1/0, or matched object/#-1.'),'Test inheritance, including the object itself.');
    add('owned_objects','world',[object()],result('list','Objects owned by this object in ID order.'),'Find owned objects.');
    add('locate_by_name','world',[parameter('name','string','Substring to search for.'),parameter('caseMatters','int','Nonzero enables case-sensitive matching.',true)],result('list','Matching objects in ID order.'),'Search object names.',['Wizard permission checks are not enforced.']);
    add('respond_to','world',[object(),parameter('verb','string','Callable verb name.')],result('any','{definer, names} if callable; otherwise 0.'),'Find a callable verb through inheritance.',['Object read permission checks are not enforced.']);
  }
  add('function_info','core',[parameter('name','string','Builtin name; omit to describe all available builtins.',true)],result('list','{name, minArgs, maxArgs, types}, or a list of those descriptions.'),'Inspect available builtins.', ['Unlimited arity is -1. General unions use type code -1; numeric unions use -2. Return information is available through the JavaScript catalog.']);
  for (const utility of [...utilities, ...codecs, ...regexBuiltins, ...cryptoBuiltins, ...clockBuiltins, ...fileBuiltins, ...connectionBuiltins, ...sqliteBuiltins, ...serviceBuiltins]) {
    if (utility.profiles && !utility.profiles.includes(profile)) continue;
    const parameters = profile === 'lambdamoo' && utility.name === 'listen' ? utility.parameters.map((p,i)=>i===2?{...p,types:['any'] as BuiltinValueType[]}:p) : profile === 'lambdamoo' && ['open_network_connection','listeners','unlisten'].includes(utility.name) ? utility.parameters.slice(0,utility.name==='listeners'?0:utility.name==='unlisten'?1:2) : profile === 'lambdamoo' && ['connection_name','connection_options','server_version','shutdown'].includes(utility.name) ? utility.parameters.slice(0,utility.name==='server_version'?0:1) : profile === 'lambdamoo' && ['random','string_hash','binary_hash','value_hash'].includes(utility.name) ? utility.parameters.slice(0,1) : utility.name === 'is_member' && profile === 'lambdamoo' ? utility.parameters.slice(0,2).map(p => p.name === 'collection' ? { ...p, types: ['list'] as BuiltinValueType[] } : p) : utility.parameters;
    add(utility.name, (utility.name.startsWith('file_')||utility.name.startsWith('sqlite_')||connectionBuiltins.some(b=>b.name===utility.name)||serviceBuiltins.some(b=>b.name===utility.name))?'world':'core', parameters, result(utility.returns, utility.summary), utility.summary, utility.notes, utility.rest);
  }
  const list = Object.freeze([...entries.values()].map(entry => entry.info).sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { entries, list };
}
const catalogs = { lambdamoo: build('lambdamoo'), toaststunt: build('toaststunt') };
export function listBuiltins(options: BuiltinCatalogOptions): readonly BuiltinInfo[] {
  assertProfile(options?.profile); return catalogs[options.profile].list;
}
export function getBuiltinInfo(name: string, options: BuiltinCatalogOptions): BuiltinInfo | undefined {
  assertProfile(options?.profile);
  if (typeof name !== 'string') throw new HostError('Builtin name must be a string');
  return catalogs[options.profile].entries.get(nameKey(name))?.info;
}
export function builtinRoute(name: string, profile: Profile): Route | undefined { return catalogs[profile].entries.get(name)?.route; }
export function checkBuiltinArity(name: string, count: number, profile: Profile): void {
  const info = getBuiltinInfo(name, { profile });
  if (!info) fail('E_INVARG', `Host built-in ${name} is not provided by this runtime in ${profile}`);
  if (count < info.minArgs || (info.maxArgs !== null && count > info.maxArgs)) fail('E_ARGS');
}
