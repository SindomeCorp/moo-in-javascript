import type { Statement } from '../ast/nodes.js';
import type { Diagnostic, SourceSpan } from '../ast/source.js';
import { HostError } from '../parser/index.js';
import { moo, encodeValue, type MooValue, type ErrorCode } from '../values/index.js';
import type { World, VerbData } from '../world/index.js';
import type { Budget } from './budget.js';
import { fail, MooError, LimitError, type CallFrame } from './errors.js';
import { Evaluator } from './evaluator.js';
import type { EvaluationHost } from './host.js';
import { invokeWorldBuiltin } from '../builtins/world.js';
import { HostRaisedError, raiseFromHost, type HostVerb } from './registrations.js';

export interface OutputEvent { readonly runId: string; readonly sequence: number; readonly recipient: MooValue; readonly text: string }
export type CompileBody = (source: string) => { ok: true; body: readonly Statement[] } | { ok: false; diagnostics: readonly Diagnostic[] };
export class Execution implements EvaluationHost {
  readonly output: OutputEvent[] = [];
  readonly frames: CallFrame[] = [];
  #cache = new WeakMap<VerbData, readonly Statement[]>();
  constructor(readonly world: World, readonly budget: Budget, readonly compile: CompileBody,
    readonly runId: string, readonly onOutput?: (event: OutputEvent) => void, readonly hostVerbs: ReadonlyMap<string, HostVerb> = new Map()) {}
  get current(): CallFrame { return this.frames.at(-1)!; }
  run(body: readonly Statement[], frame: CallFrame, args: readonly MooValue[]): MooValue {
    this.budget.call(this.frames.length + 1); this.frames.push(frame);
    const evaluator = new Evaluator(this.world.profile, this.budget, this);
    for (const key of ['this', 'player', 'caller'] as const) evaluator.variables.set(key, moo.object(frame[key]));
    evaluator.variables.set('args', moo.list(args)); evaluator.variables.set('verb', moo.string(frame.verb));
    try { return evaluator.evaluate(body); }
    catch (error) {
      if ((error instanceof MooError || error instanceof LimitError) && !error.frames) {
        error.frames = this.frames.slice().reverse().map((f, i) => i === 0 && error.span ? { ...f, span: error.span } : { ...f });
      }
      throw error;
    } finally { this.frames.pop(); }
  }
  call(receiver: MooValue, name: MooValue, args: MooValue[], span: SourceSpan): MooValue {
    this.current.span = span;
    if (receiver.type !== 'object' || name.type !== 'string') fail('E_TYPE');
    this.world.get(receiver.value, true);
    return this.invoke(receiver.value, name.value, args, receiver.value);
  }
  pass(args: MooValue[], span: SourceSpan): MooValue {
    this.current.span = span;
    if (this.current.definer === -1n) fail('E_VERBNF', 'pass() requires a defined verb frame');
    const parent = this.world.get(this.current.definer).parent;
    return this.invoke(this.current.this, this.current.verb, args, parent);
  }
  private invoke(receiver: bigint, name: string, args: MooValue[], start: bigint): MooValue {
    const found = start === -1n ? undefined : this.world.findVerb(start, name, this.budget);
    if (!found) fail('E_VERBNF', `World verb #${receiver}:${name} does not exist`);
    const frame: CallFrame = { this: receiver, definer: found.definer, player: this.current.player,
      caller: this.current.this, programmer: found.verb.owner, verb: name };
    if (found.verb.hostId !== undefined) {
      const implementation = this.hostVerbs.get(found.verb.hostId);
      if (!implementation) throw new HostError('Host verb registration ' + found.verb.hostId + ' is unavailable');
      this.budget.call(this.frames.length + 1); this.frames.push(frame);
      try {
        const result = implementation(Object.freeze({
          world: this.world, frame: Object.freeze({ ...frame }), args: Object.freeze([...args]),
          notify: (recipient: MooValue, text: string) => { this.notify(recipient, moo.string(text)); },
          chargeSteps: (count: number) => this.budget.step(count),
          chargeAllocations: (count: number) => this.budget.allocate(count),
          raise: (code: ErrorCode, message?: string, value?: MooValue): never => {
            if (value !== undefined) encodeValue(value, { profile: this.world.profile });
            return raiseFromHost(code, message, value);
          },
        }));
        encodeValue(result, { profile: this.world.profile });
        return result;
      } catch (error) {
        if (error instanceof HostRaisedError || error instanceof LimitError) {
          if (!error.frames) error.frames = this.frames.slice().reverse().map(f => ({ ...f }));
          throw error;
        }
        throw new HostError('Host verb ' + found.verb.hostId + ' failed', { cause: error });
      } finally { this.frames.pop(); }
    }
    let body = this.#cache.get(found.verb);
    if (!body) {
      this.budget.step(found.verb.source.length);
      const compiled = this.compile(found.verb.source);
      if (!compiled.ok) throw new HostError(`Stored verb #${found.definer}:${name} does not compile: ${compiled.diagnostics.map(d => d.message).join('; ')}`);
      body = compiled.body; this.#cache.set(found.verb, body);
    }
    return this.run(body, frame, args);
  }
  builtin(name: string, args: MooValue[], span: SourceSpan): MooValue | undefined {
    this.current.span = span; return invokeWorldBuiltin(name, args, this);
  }
  notify(recipient: MooValue, message: MooValue): MooValue {
    if (recipient.type !== 'object' || message.type !== 'string') fail('E_TYPE');
    this.world.get(recipient.value);
    this.budget.output(message.value.length);
    const event = Object.freeze({ runId: this.runId, sequence: this.output.length, recipient, text: message.value });
    this.output.push(event);
    try { this.onOutput?.(event); } catch (cause) { throw new HostError('Output delivery failed', { cause }); }
    return moo.int(1);
  }
  traceback(error: MooError): MooValue {
    const captured = error.frames ?? this.frames.slice().reverse().map((f, i) => i === 0 && error.span ? { ...f, span: error.span } : f);
    const frames = captured.slice(0, Math.max(1, captured.length - this.frames.length + 1));
    this.budget.allocate(frames.length * 7);
    return moo.list(frames.map(frame => moo.list([moo.object(frame.this), moo.string(frame.verb), moo.object(frame.programmer),
      moo.object(frame.definer), moo.object(frame.player), moo.int((frame.span?.start.row ?? 0) + 1)])));
  }
}
