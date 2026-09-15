import { createParser, HostError, type MooParser, type ParserOptions, type Profile } from '../parser/index.js';
import { lower } from '../parser/compile.js';
import type { Diagnostic, SourceSpan } from '../ast/source.js';
import type { Statement } from '../ast/nodes.js';
import { Budget, type Limits, type Statistics } from './budget.js';
import { MooError, LimitError, type CallFrame } from './errors.js';
import { moo, encodeValue, type MooValue, type ErrorCode } from '../values/index.js';
import { World, createWorld, type WorldChange } from '../world/index.js';
import { Execution, type OutputEvent } from './execution.js';
import { decodeWorld, saveWorld, type LoadWorldOptions, type SnapshotLimits } from '../snapshots/codec.js';
import type { HostVerb, HostVerbRegistrations } from './registrations.js';

export interface Program { readonly profile: Profile; readonly source: string }
export interface RuntimeOptions extends ParserOptions { hostVerbs?: HostVerbRegistrations }
export type Compilation = { ok: true; program: Program } | { ok: false; diagnostics: readonly Diagnostic[] };
export interface InvocationContext { this?: MooValue; player?: MooValue; caller?: MooValue; args?: readonly MooValue[]; verb?: string }
export interface ExecuteOptions { context?: InvocationContext; limits?: Limits; world?: World; runId?: string; onOutput?: (event: OutputEvent) => void }
export interface RuntimeDiagnostic {
  category: 'runtime-error' | 'limit-exceeded'; message: string; code?: ErrorCode;
  span?: SourceSpan; stack: readonly CallFrame[];
}
interface ResultBase { output: readonly OutputEvent[]; changes: readonly WorldChange[]; commit: 'committed' | 'discarded'; statistics: Statistics }
export type ExecutionResult = ResultBase & (
  | { status: 'completed'; value: MooValue; diagnostics: readonly [] }
  | { status: 'runtime-error' | 'limit-exceeded'; diagnostics: readonly RuntimeDiagnostic[] }
  | { status: 'syntax-error' | 'unsupported-feature'; diagnostics: readonly Diagnostic[] }
);

export async function createRuntime(options: RuntimeOptions): Promise<Runtime> {
  const parser = await createParser(options);
  try { return new Runtime(parser, options.hostVerbs); }
  catch (error) { parser.dispose(); throw error; }
}

export class Runtime {
  #programs = new WeakMap<Program, readonly Statement[]>();
  #disposed = false;
  #runCounter = 0;
  #hostVerbs = new Map<string, HostVerb>();
  readonly profile: Profile;
  constructor(readonly parser: MooParser, hostVerbs: HostVerbRegistrations = {}) {
    this.profile = parser.profile;
    if (!hostVerbs || typeof hostVerbs !== 'object' || Array.isArray(hostVerbs)) throw new HostError('hostVerbs must be an object mapping IDs to functions');
    for (const [id, implementation] of Object.entries(hostVerbs)) {
      if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(id) || typeof implementation !== 'function') throw new HostError('Host verbs require stable IDs and synchronous implementations');
      this.#hostVerbs.set(id, implementation);
    }
  }
  private check(): void { if (this.#disposed) throw new HostError('Runtime has been disposed'); }
  hasHostVerb(id: string): boolean { this.check(); return this.#hostVerbs.has(id); }
  saveWorld(world: World, limits?: SnapshotLimits): string {
    this.check();
    if (world.profile !== this.profile) throw new HostError('World and runtime profiles must match');
    return saveWorld(world, limits);
  }
  loadWorld(input: unknown, options: LoadWorldOptions = {}): World {
    this.check(); return decodeWorld(input, this, options);
  }
  compile(source: string): Compilation {
    this.check();
    const parsed = this.parser.parse(source);
    if (!parsed.ok) return parsed;
    const converted = lower(parsed.syntax, this.profile);
    if (!converted.ok) return converted;
    const program = Object.freeze({ profile: this.profile, source });
    this.#programs.set(program, converted.body);
    return { ok: true, program };
  }
  execute(program: Program, options: ExecuteOptions = {}): ExecutionResult {
    this.check();
    const body = this.#programs.get(program);
    if (!body || program.profile !== this.profile) throw new HostError('Program belongs to another runtime or profile');
    const budget = new Budget(options.limits);
    const world = options.world ?? createWorld({ profile: this.profile });
    if (!(world instanceof World) || world.profile !== this.profile) throw new HostError('World and runtime profiles must match');
    if (options.onOutput !== undefined && typeof options.onOutput !== 'function') throw new HostError('onOutput must be a function');
    if (options.runId !== undefined && (typeof options.runId !== 'string' || !options.runId.length || options.runId.length > 256)) throw new HostError('runId must be a nonempty string of at most 256 characters');
    const context = options.context ?? {};
    if (context.verb !== undefined && typeof context.verb !== 'string') throw new HostError('Context verb must be a string');
    const frame: CallFrame = { this: -1n, player: -1n, caller: -1n, programmer: -1n, definer: -1n, verb: context.verb ?? '' };
    for (const key of ['this', 'player', 'caller'] as const) {
      const value = context[key] ?? moo.object(-1);
      if (value.type !== 'object') throw new HostError(`${key} context must be an object reference`);
      encodeValue(value, { profile: this.profile }); frame[key] = value.value;
    }
    frame.programmer = frame.player;
    const args = moo.list(context.args ?? []);
    encodeValue(args, { profile: this.profile });
    const release = world.acquireExecution();
    try {
    const before = world.objects(), beforeNextId = world.nextId;
    const execution = new Execution(world, budget, source => {
      const compiled = this.compile(source);
      return compiled.ok ? { ok: true, body: this.#programs.get(compiled.program)! } : compiled;
    }, options.runId ?? `run-${++this.#runCounter}`, options.onOutput, this.#hostVerbs);
    const base: ResultBase = { output: execution.output, changes: [], commit: 'committed', statistics: budget.stats };
    try {
      const value = execution.run(body, frame, context.args ?? []);
      // Reserve a bounded, lossless result for both direct and worker callers.
      // Local values can share subtrees whose expanded encoding is much larger.
      try { encodeValue(value, { profile: this.profile }); }
      catch (error) {
        if (!(error instanceof HostError)) throw error;
        throw new LimitError('resultValue');
      }
      return { ...base, changes: world.changes(before, beforeNextId), status: 'completed', value, diagnostics: [] };
    }
    catch (error) {
      if (!(error instanceof MooError) && !(error instanceof LimitError)) throw error;
      const status = error instanceof MooError ? 'runtime-error' : 'limit-exceeded';
      const diagnostic: RuntimeDiagnostic = { category: status, message: error.message, stack: error.frames ?? [] };
      if (error instanceof MooError) diagnostic.code = error.code;
      if (error.span) diagnostic.span = error.span;
      return { ...base, changes: world.changes(before, beforeNextId), status, diagnostics: [diagnostic] };
    }
    } finally { release(); }
  }
  run(source: string, options: ExecuteOptions = {}): ExecutionResult {
    const compiled = this.compile(source);
    if (compiled.ok) return this.execute(compiled.program, options);
    return { status: compiled.diagnostics.some(d => d.category === 'syntax-error') ? 'syntax-error' : 'unsupported-feature',
      diagnostics: compiled.diagnostics, output: [], changes: [], commit: 'discarded',
      statistics: { steps: 0, allocations: 0, peakEvaluationDepth: 0, peakCallDepth: 0, outputCharacters: 0, outputEvents: 0 } };
  }
  dispose(): void { this.parser.dispose(); this.#disposed = true; this.#programs = new WeakMap(); }
}
