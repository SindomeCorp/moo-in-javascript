import { transferCapacity } from './capacity.js';
import type { SnapshotLimits } from '../snapshots/codec.js';
import { HostError, type ParserOptions } from '../parser/index.js';
import { decodeValue, encodeValue } from '../values/index.js';
import type { Runtime, ExecuteOptions, ExecutionResult } from '../runtime/index.js';
import type { OutputEvent } from '../runtime/execution.js';
import type { World } from '../world/index.js';
import type { ExecuteRequest, WorkerRequest, WorkerResponse, WireContext } from './protocol.js';

export interface WorkerTransport {
  postMessage(request: WorkerRequest): void;
  terminate(): void;
  subscribe(message: (response: WorkerResponse) => void, error: (error: unknown) => void): () => void;
}
export type WorkerFactory = () => WorkerTransport;
export interface WorkerSessionOptions { reuseWorker?: boolean; unsupportedSourcePolicy?: 'reject' | 'retain'; runtime: Runtime; world: World; workerFactory?: WorkerFactory; parserOptions?: Omit<ParserOptions, 'profile'> }
export interface WorkerRunOptions extends Omit<ExecuteOptions, 'world' | 'runId'> { timeoutMs?: number }
export interface CancelledResult { status: 'cancelled'; reason: 'stop' | 'timeout'; commit: 'discarded'; output: readonly OutputEvent[]; changes: readonly []; diagnostics: readonly []; statistics: null }
export interface WorkerRun { result: Promise<ExecutionResult | CancelledResult>; stop(): void }
export class WorkerHostError extends HostError {
  readonly commit = 'unavailable';
  constructor(message: string, readonly output: readonly OutputEvent[]) { super(message); }
}
export function browserWorkerFactory(url = new URL('../../dist/worker/browser.js', import.meta.url)): WorkerFactory {
  return () => {
    const worker = new Worker(url, { type: 'module' });
    return { postMessage: request => worker.postMessage(request), terminate: () => worker.terminate(),
      subscribe(message, error) {
        const receive = (event: MessageEvent<WorkerResponse>) => message(event.data);
        const fail = (event: ErrorEvent | MessageEvent) => error(event instanceof ErrorEvent ? event.message : 'Worker message could not be decoded');
        worker.addEventListener('message', receive); worker.addEventListener('error', fail); worker.addEventListener('messageerror', fail);
        return () => { worker.removeEventListener('message', receive); worker.removeEventListener('error', fail); worker.removeEventListener('messageerror', fail); };
      } };
  };
}
let nextRun = 0;
export class WorkerSession {
  #busy = false;
  #initial: string;
  #worker: WorkerTransport | undefined;
  #idleUnsubscribe: (()=>void) | undefined;
  #cancel: (()=>void) | undefined;
  #disposed=false;
  private dropWorker(): void {
    try{this.#idleUnsubscribe?.();}catch{}this.#idleUnsubscribe=undefined;
    try{this.#worker?.terminate();}catch{}this.#worker=undefined;
  }
  private idle(): void {
    const worker=this.#worker;
    const discard=()=>{if(this.#worker===worker && !this.#busy)this.dropWorker();};
    try{if(worker)this.#idleUnsubscribe=worker.subscribe(message=>{if(message.type==='host-error')discard();},discard);}
    catch{this.dropWorker();}
  }
  private worker(): WorkerTransport {
    this.#idleUnsubscribe?.();this.#idleUnsubscribe=undefined;
    return this.#worker??=(this.options.workerFactory??browserWorkerFactory())();
  }
  /** Start parser/world validation without executing learner code. */
  warmup(): void {
    if(this.#disposed)throw new HostError('Worker session has been disposed');
    if(!this.options.reuseWorker || this.#busy || this.#worker)return;
    try{
      const worker=this.worker();this.idle();
      worker.postMessage({type:'warmup',id:`warmup-${++nextRun}`,snapshot:this.save(transferCapacity(this.world.limits)),
        worldLimits:this.world.limits,unsupportedSourcePolicy:this.options.unsupportedSourcePolicy??'reject',
        options:{...this.options.parserOptions,profile:this.world.profile}});
    }catch{this.dropWorker();} // A foreground run can retry initialization.
  }
  dispose(): void {this.#disposed=true;this.#cancel?.();this.dropWorker();}

  constructor(readonly options: WorkerSessionOptions) {
    const limits = transferCapacity(options.world.limits);
    this.#initial = options.runtime.saveWorld(options.world, limits);
    options.runtime.loadWorld(this.#initial, { worldLimits: options.world.limits, limits, unsupportedSourcePolicy:options.unsupportedSourcePolicy ?? 'reject' });
  }
  get world(): World { return this.options.world; }
  get busy(): boolean { return this.#busy; }
  save(limits?: SnapshotLimits): string { return this.options.runtime.saveWorld(this.world, limits); }
  load(input: unknown, limits?: SnapshotLimits): void { this.options.runtime.loadWorld(input, { unsupportedSourcePolicy:this.options.unsupportedSourcePolicy ?? 'reject', world: this.world, ...(limits ? { limits } : {}) }); }
  reset(): void { this.load(this.#initial, transferCapacity(this.world.limits)); }
  run(source: string, options: WorkerRunOptions = {}): WorkerRun {
    if(this.#disposed)throw new HostError('Worker session has been disposed');
    if (this.#busy) throw new HostError('Worker session runs must be serialized');
    const timeout = options.timeoutMs ?? 5000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2_147_483_647) throw new HostError('timeoutMs must be a positive timer interval');
    const runtime = this.options.runtime, world = this.world;
    const capacity = transferCapacity(world.limits);
    const snapshot = runtime.saveWorld(world, capacity), before = world.objects(), beforeId = world.nextId, beforeEnvironment=world.environment;
    const profile = world.profile, context: WireContext = {};
    for (const key of ['this', 'player', 'caller'] as const) if (options.context?.[key] !== undefined) context[key] = encodeValue(options.context[key], { profile });
    if (options.context?.args) context.args = options.context.args.map(value => encodeValue(value, { profile }));
    if (options.context?.verb !== undefined) context.verb = options.context.verb;
    const id = `worker-${++nextRun}`;
    const request: ExecuteRequest = { type: 'execute', id, source, snapshot, worldLimits: world.limits, unsupportedSourcePolicy:this.options.unsupportedSourcePolicy ?? 'reject',
      options: { ...this.options.parserOptions, profile }, context, ...(options.limits ? { limits: options.limits } : {}) };
    let release = world.acquireIsolation();
    this.#busy = true;
    let worker: WorkerTransport | undefined, unsubscribe: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const output: OutputEvent[] = [];
    let resolve!: (result: ExecutionResult | CancelledResult) => void, reject!: (error: WorkerHostError) => void;
    const result = new Promise<ExecutionResult | CancelledResult>((yes, no) => { resolve = yes; reject = no; });
    const cleanup = (keepWorker=false) => {
      settled = true; clearTimeout(timer);
      try { unsubscribe?.(); } catch { /* Transport cleanup cannot change an outcome. */ }
      if(keepWorker && this.options.reuseWorker && !this.#disposed)this.idle();else this.dropWorker();
      this.#cancel=undefined;
      release(); release = () => {}; this.#busy = false;
    };
    const fail = (error: unknown) => {
      if (settled) return;
      cleanup(); reject(new WorkerHostError(error instanceof Error ? error.message : String(error), Object.freeze([...output])));
    };
    const cancel = (reason: 'stop' | 'timeout') => {
      if (settled) return;
      cleanup(); resolve({ status: 'cancelled', reason, commit: 'discarded', output: Object.freeze([...output]), changes: [], diagnostics: [], statistics: null });
    };
    try {
      this.#cancel=()=>cancel('stop');
      worker = this.worker();
      unsubscribe = worker.subscribe(message => {
        if (settled) return;
        try {
          if (!message || typeof message !== 'object' || typeof message.id !== 'string') throw new HostError('Invalid worker message');
          if (message.id !== id) return;
          if (message.type === 'host-error') { fail(message.message); return; }
          if (message.type === 'output') {
            if (message.event.runId !== id || message.event.sequence !== output.length || typeof message.event.text !== 'string') throw new HostError('Invalid worker output sequence');
            const recipient = decodeValue(message.event.recipient, { profile });
            if (recipient.type !== 'object') throw new HostError('Invalid worker output recipient');
            const event = Object.freeze({ ...message.event, recipient }); output.push(event); options.onOutput?.(event);
          } else if (message.type === 'terminal') {
            if (message.outputCount !== output.length) throw new HostError('Incomplete worker output transfer');
            const wire = message.result;
            const candidate = message.snapshot===snapshot ? undefined : runtime.loadWorld(message.snapshot, { worldLimits: world.limits, limits: capacity, unsupportedSourcePolicy:this.options.unsupportedSourcePolicy ?? 'reject' });
            const base = { statistics: wire.statistics, commit: wire.commit, output: Object.freeze([...output]), changes: [] as ExecutionResult['changes'] };
            let final: ExecutionResult;
            if (wire.status === 'completed') final = { ...base, status: wire.status, value: decodeValue(wire.value, { profile }), diagnostics: [] };
            else if (wire.status === 'runtime-error' || wire.status === 'limit-exceeded') final = { ...base, status: wire.status,
              diagnostics: wire.diagnostics.map(diagnostic => ({ ...diagnostic, stack: diagnostic.stack.map(frame => ({ ...frame,
                this: BigInt(frame.this), definer: BigInt(frame.definer), player: BigInt(frame.player), caller: BigInt(frame.caller), programmer: BigInt(frame.programmer) })) })) };
            else if (wire.status === 'syntax-error' || wire.status === 'unsupported-feature') final = { ...base, status: wire.status, diagnostics: wire.diagnostics as readonly import('../ast/source.js').Diagnostic[] };
            else throw new HostError('Invalid worker terminal status');
            const shouldCommit = final.status === 'completed' || final.status === 'runtime-error' || final.status === 'limit-exceeded';
            if (wire.commit !== (shouldCommit ? 'committed' : 'discarded')) throw new HostError('Invalid worker commit status');
            if (shouldCommit && candidate) {
              // Snapshot decoding creates fresh records; suppress unchanged-object reports.
              const encodeScalar = (_: string, value: unknown) => typeof value === 'bigint' ? value.toString() : Object.is(value, -0) ? '-0' : value;
              const equal = (a: unknown, b: unknown) => JSON.stringify(a, encodeScalar) === JSON.stringify(b, encodeScalar);
              final.changes = candidate.changes(before, beforeId, beforeEnvironment).filter(change => (change.kind !== 'object-updated' && change.kind !== 'host-state') || !equal(change.before, change.after));
              release(); release = () => {};
              world.replaceWith(candidate);
            }
            cleanup(true); resolve(final);
          } else throw new HostError('Invalid worker message type');
        } catch (error) { fail(error); }
      }, fail);
      timer = setTimeout(() => cancel('timeout'), timeout);
      worker.postMessage(request);
    } catch (error) { fail(error); }
    return { result, stop: () => cancel('stop') };
  }
}
export function createWorkerSession(options: WorkerSessionOptions): WorkerSession { return new WorkerSession(options); }
