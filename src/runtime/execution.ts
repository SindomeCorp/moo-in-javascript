import type { Evaluation } from './suspension.js';
import type { Statement } from '../ast/nodes.js';
import type { Diagnostic, SourceSpan } from '../ast/source.js';
import { HostError } from '../parser/index.js';
import { truth } from '../values/operations.js';
import { moo, encodeValue, type MooValue, type ErrorCode } from '../values/index.js';
import type { World, VerbData } from '../world/index.js';
import type { Budget } from './budget.js';
import { fail, MooError, LimitError, UnsupportedSourceError, type CallFrame } from './errors.js';
import { Evaluator } from './evaluator.js';
import type { EvaluationHost } from './host.js';
import { invokeBuiltin } from '../builtins/core.js';
import { checkBuiltinArity } from '../builtins/catalog.js';
import { invokeWorldBuiltin } from '../builtins/world.js';
import { HostRaisedError, raiseFromHost, type HostVerb } from './registrations.js';

export interface OutputEvent { readonly runId: string; readonly sequence: number; readonly recipient: MooValue; readonly text: string }
export type CompileBody = (source: string) => { ok: true; body: readonly Statement[] } | { ok: false; diagnostics: readonly Diagnostic[] };
export class Execution implements EvaluationHost {
  readonly output: OutputEvent[] = [];
  readonly frames: CallFrame[] = [];
  taskLocal: MooValue = moo.int(0);
  #cache = new WeakMap<VerbData, readonly Statement[]>();
  constructor(readonly world: World, readonly budget: Budget, readonly compile: CompileBody,
    readonly runId: string, readonly onOutput?: (event: OutputEvent) => void, readonly hostVerbs: ReadonlyMap<string, HostVerb> = new Map(), readonly taskId = 1) {}
  get current(): CallFrame { return this.frames.at(-1)!; }
  *run(body: readonly Statement[], frame: CallFrame, args: readonly MooValue[]): Evaluation<MooValue> {
    this.budget.call(this.frames.length + 1); this.frames.push(frame);
    const evaluator = new Evaluator(this.world.profile, this.budget, this);
    for (const key of ['this', 'player', 'caller'] as const) evaluator.variables.set(key, moo.object(frame[key]));
    evaluator.variables.set('args', moo.list(args)); evaluator.variables.set('verb', moo.string(frame.verb));
    try { return (yield* evaluator.evaluate(body)); }
    catch (error) {
      if ((error instanceof MooError || error instanceof LimitError) && !error.frames) {
        error.frames = this.frames.slice().reverse().map((f, i) => i === 0 && error.span ? { ...f, span: error.span } : { ...f });
      }
      throw error;
    } finally { this.frames.pop(); }
  }
  *call(receiver: MooValue, name: MooValue, args: MooValue[], span: SourceSpan): Evaluation<MooValue> {
    this.current.span = span;
    if (receiver.type !== 'object' || name.type !== 'string') fail('E_TYPE');
    this.world.get(receiver.value, true);
    return (yield* this.invoke(receiver.value, name.value, args, receiver.value));
  }
  *pass(args: MooValue[], span: SourceSpan): Evaluation<MooValue> {
    this.current.span = span;
    if (this.current.definer === -1n) fail('E_VERBNF', 'pass() requires a defined verb frame');
    const parent = this.world.get(this.current.definer).parent;
    return (yield* this.invoke(this.current.this, this.current.verb, args, parent));
  }
  private *invoke(receiver: bigint, name: string, args: MooValue[], start: bigint): Evaluation<MooValue> {
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
      if (!compiled.ok && compiled.diagnostics.every(d => d.category === 'unsupported-feature')) throw new UnsupportedSourceError(compiled.diagnostics.map(d=>({...d,message:`Stored verb #${found.definer}:${name}: ${d.message}`})));
      if (!compiled.ok) throw new HostError(`Stored verb #${found.definer}:${name} does not compile: ${compiled.diagnostics.map(d => d.message).join('; ')}`);
      body = compiled.body; this.#cache.set(found.verb, body);
    }
    return (yield* this.run(body, frame, args));
  }
  *builtin(name: string, args: MooValue[], span: SourceSpan): Evaluation<MooValue | undefined> {
    this.current.span = span; return (yield* invokeWorldBuiltin(name, args, this));
  }
  *initialize(id: bigint): Evaluation<void> {if(this.world.findVerb(id,'initialize',this.budget))(yield* this.invoke(id,'initialize',[],id));}
  *move(id: bigint, destination: bigint, position: number): Evaluation<MooValue> {
    const object=this.world.get(id);if(destination!==-1n)this.world.get(destination);
    if(destination!==-1n&&destination!==(object.location??-1n)){
      const accepts=this.world.findVerb(destination,'accept',this.budget)?(yield* this.invoke(destination,'accept',[moo.object(id)],destination)):moo.int(0);
      const wizard=this.world.valid(this.current.programmer)&&this.world.get(this.current.programmer).flags.wizard;
      if(!truth(accepts)&&!wizard)fail('E_NACC');
    }
    if(!this.world.valid(id)||(destination!==-1n&&!this.world.valid(destination)))return moo.int(0);
    const old=this.world.get(id).location??-1n;
    this.world.relocate(id,destination,position,this.budget);
    if(old!==destination){
      if(this.world.valid(old)&&this.world.findVerb(old,'exitfunc',this.budget))(yield* this.invoke(old,'exitfunc',[moo.object(id)],old));
      if(this.world.valid(id)&&this.world.valid(destination)&&this.world.get(id).location===destination&&this.world.findVerb(destination,'enterfunc',this.budget))(yield* this.invoke(destination,'enterfunc',[moo.object(id)],destination));
    }
    return moo.int(0);
  }
  *dynamicBuiltin(name: string, args: MooValue[]): Evaluation<MooValue> {
    name = name.replace(/[A-Z]/g, c => c.toLowerCase());
    this.budget.enter();
    try {
      this.budget.step(); checkBuiltinArity(name,args.length,this.world.profile);
      if (name === 'pass') {
        if (this.current.definer === -1n) fail('E_VERBNF');
        return (yield* this.invoke(this.current.this,this.current.verb,args,this.world.get(this.current.definer).parent));
      }
      return (yield* invokeWorldBuiltin(name,args,this)) ?? invokeBuiltin(name,args,{profile:this.world.profile,budget:this.budget});
    } finally { this.budget.leave(); }
  }
  *evaluateSource(lines: string[]): Evaluation<MooValue> {
    const length = lines.reduce((n,s)=>n+s.length+1,0);this.budget.step(length);this.budget.allocate(length+2);
    const compiled = this.compile(lines.join('\n'));
    if (!compiled.ok) {this.budget.allocate(compiled.diagnostics.reduce((n,d)=>n+d.message.length+1,0));return moo.list([moo.int(0),moo.list(compiled.diagnostics.map(d=>moo.string(d.message)))]);}
    const current=this.current;
    const value=(yield* this.run(compiled.body,{this:-1n,definer:-1n,caller:current.this,player:current.player,programmer:current.programmer,verb:''},[]));
    return moo.list([moo.int(1),value]);
  }
  notify(recipient: MooValue, message: MooValue): MooValue {
    if (recipient.type !== 'object' || message.type !== 'string') fail('E_TYPE');
    if (!this.world.environment?.connections?.some(c => c.player === String(recipient.value))) this.world.get(recipient.value);
    this.budget.output(message.value.length);
    if(this.world.environment?.connections?.some(c=>c.player===String(recipient.value))){
      const state=structuredClone(this.world.environment),conn=state.connections!.find(c=>c.player===String(recipient.value))!;
      conn.output.push(message.value);state.time++;this.world.setEnvironment(state,this.budget);
    }
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
