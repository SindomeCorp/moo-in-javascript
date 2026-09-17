import type { Evaluation } from './suspension.js';
import type { Argument, Expr, Statement, Target, CatchCodes } from '../ast/nodes.js';
import { HostError, type Profile } from '../parser/index.js';
import { moo, type MooValue } from '../values/index.js';
import { binary, unary, truth, length, index, slice, replaceIndex, replaceSlice, mapSet, typeNumbers } from '../values/operations.js';
import { invokeBuiltin } from '../builtins/core.js';
import { Budget } from './budget.js';
import { fail, MooError, LimitError } from './errors.js';
import type { EvaluationHost } from './host.js';

type Flow = { kind: 'return'; value: MooValue } | { kind: 'break' | 'continue'; label: string | null } | undefined;
interface Reference { get(): MooValue; set(value: MooValue): void }

export class Evaluator {
  readonly variables = new Map<string, MooValue>();
  #dollars: MooValue[] = [];
  constructor(readonly profile: Profile, readonly budget: Budget, readonly host: EvaluationHost) {
    for (const [name, tag] of Object.entries({ int: 'int', num: 'int', float: 'float', obj: 'object', str: 'string', err: 'error', list: 'list', ...(profile === 'toaststunt' ? { map: 'map' } : {}) })) {
      this.variables.set(name, moo.int(typeNumbers[tag as keyof typeof typeNumbers]));
    }
    for (const name of ['argstr', 'dobjstr', 'prepstr', 'iobjstr']) this.variables.set(name, moo.string(''));
    for (const name of ['dobj', 'iobj']) this.variables.set(name, moo.object(-1));
  }

  *evaluate(body: readonly Statement[]): Evaluation<MooValue> {
    const flow = (yield* this.block(body));
    return flow?.kind === 'return' ? flow.value : moo.int(0);
  }
  private *block(body: readonly Statement[]): Evaluation<Flow> {
    for (const statement of body) { const flow = (yield* this.statement(statement)); if (flow) return flow; }
    return undefined;
  }
  private *statement(statement: Statement): Evaluation<Flow> {
    try {
    this.budget.step();
    switch (statement.kind) {
      case 'empty': return;
      case 'expression': (yield* this.expression(statement.expression)); return;
      case 'return': return { kind: 'return', value: statement.expression ? (yield* this.expression(statement.expression)) : moo.int(0) };
      case 'break': case 'continue': return { kind: statement.kind, label: statement.label };
      case 'if':
        for (const branch of statement.branches) if (truth((yield* this.expression(branch.condition)))) return (yield* this.block(branch.body));
        return (yield* this.block(statement.otherwise));
      case 'while':
        while (truth((yield* this.expression(statement.condition)))) {
          const flow = (yield* this.block(statement.body));
          if (flow?.kind === 'return' || (flow && flow.label !== null)) return flow;
          if (flow?.kind === 'break') break;
        }
        return;
      case 'for': {
        const run = function*(this: Evaluator, value: MooValue): Evaluation<Flow> {
          this.budget.step(); this.variables.set(statement.variable, value);
          return (yield* this.block(statement.body));
        };
        const handles = (flow: Exclude<Flow, undefined>) => flow.kind !== 'return' && (flow.label === null || flow.label === statement.variable);
        if (statement.collection.kind === 'range') {
          const start = (yield* this.expression(statement.collection.start)), end = (yield* this.expression(statement.collection.end));
          if (start.type !== 'int' || end.type !== 'int') fail('E_TYPE');
          for (let i = start.value; i <= end.value; i++) {
            const flow = yield* run.call(this, moo.int(i));
            if (flow && !handles(flow)) return flow;
            if (flow?.kind === 'break') break;
          }
        } else {
          const collection = (yield* this.expression(statement.collection));
          if (collection.type !== 'list' && !(this.profile === 'toaststunt' && ['map','string'].includes(collection.type))) fail('E_TYPE');
          if (collection.type !== 'list' && collection.type !== 'map' && collection.type !== 'string') fail('E_TYPE');
          const items = collection.type === 'string' ? [...collection.value].map(moo.string) : collection.value;
          const entries = collection.type === 'map' ? collection.value : (items as readonly MooValue[]).map((item, i) => [moo.int(i + 1), item] as const);
          for (const [key, item] of entries) {
            if (statement.key) this.variables.set(statement.key, key);
            const flow = yield* run.call(this, item);
            if (flow && !handles(flow)) return flow;
            if (flow?.kind === 'break') break;
          }
        }
        return;
      }
      case 'try': {
        if (statement.finally !== null) {
          let flow: Flow, pending: MooError | undefined;
          try { flow = (yield* this.block(statement.body)); }
          catch (error) { if (!(error instanceof MooError)) throw error; pending = error; }
          const cleanup = (yield* this.block(statement.finally));
          if (cleanup) return cleanup;
          if (pending) throw pending;
          return flow;
        }
        const handlers: (typeof statement.handlers[number] & {values: 'any' | MooValue[]})[] = [];
        for (const handler of statement.handlers) handlers.push({...handler, values: (yield* this.catchCodes(handler.codes))});
        try { return (yield* this.block(statement.body)); }
        catch (error) {
          if (!(error instanceof MooError)) throw error;
          const handler = handlers.find(handler => this.matches(handler.values, error));
          if (!handler) throw error;
          if (handler.variable) {
            this.budget.allocate(4 + error.message.length);
            this.variables.set(handler.variable, moo.list([moo.error(error.code), moo.string(error.message), error.value, this.host.traceback(error)]));
          }
          return (yield* this.block(handler.body));
        }
      }
    }
    } catch (error) {
      if ((error instanceof MooError || error instanceof LimitError) && !error.span) error.span = statement.span;
      throw error;
    }
  }
  private *withDollar<T>(collection: MooValue, fn: () => Evaluation<T>): Evaluation<T> {
    this.#dollars.push(moo.int(length(collection)));
    try { return yield* fn(); } finally { this.#dollars.pop(); }
  }
  private *args(entries: readonly Argument[]): Evaluation<MooValue[]> {
    const values: MooValue[] = [];
    for (const arg of entries) {
      const value = (yield* this.expression(arg.expression));
      if (arg.splice) {
        if (value.type !== 'list') fail('E_TYPE');
        this.budget.allocate(value.value.length);
        for (const item of value.value) values.push(item);
      } else { this.budget.allocate(1); values.push(value); }
    }
    return values;
  }
  private *reference(target: Target): Evaluation<Reference> {
    if (target.kind === 'variable') {
      return { get: () => this.variables.get(target.name) ?? fail('E_VARNF', `Variable ${target.name} has no value`),
        set: value => { this.variables.set(target.name, value); } };
    }
    if (target.kind === 'property') {
      const receiver = (yield* this.expression(target.receiver)), name = (yield* this.expression(target.name));
      if (receiver.type !== 'object' || name.type !== 'string') fail('E_TYPE');
      return { get: () => this.host.world.getProperty(receiver.value, name.value, this.budget),
        set: value => this.host.world.setProperty(receiver.value, name.value, value, this.budget) };
    }
    const parent = (yield* this.reference(target.collection)), collection = parent.get();
    if (target.kind === 'index') {
      const key = (yield* this.withDollar(collection, function*(this: Evaluator) { return yield* this.expression(target.index); }.bind(this)));
      return { get: () => index(collection, key, this.budget), set: value => parent.set(replaceIndex(collection, key, value, this.budget)) };
    }
    const [start, end] = (yield* this.withDollar(collection, function*(this: Evaluator): Evaluation<MooValue[]> { return [target.start ? yield* this.expression(target.start) : moo.int(1), target.end ? yield* this.expression(target.end) : moo.int(length(collection))]; }.bind(this)));
    return { get: () => slice(collection, start!, end!, this.budget),
      set: value => parent.set(replaceSlice(collection, start!, end!, value, this.budget)) };
  }
  *expression(expression: Expr): Evaluation<MooValue> {
    let entered = false;
    try {
      this.budget.step(); this.budget.enter(); entered = true;
      switch (expression.kind) {
        case 'literal': {
          if (expression.value.type === 'string') this.budget.allocate(expression.value.value.length);
          return expression.value;
        }
        case 'variable': return this.variables.get(expression.name) ?? fail('E_VARNF', `Variable ${expression.name} has no value`);
        case 'dollar': return this.#dollars.at(-1) ?? fail('E_INVARG', '$ outside index');
        case 'list': return moo.list((yield* this.args(expression.entries)));
        case 'map': {
          let value = moo.map([]);
          for (const [key, entry] of expression.entries) value = mapSet(value, (yield* this.expression(key)), (yield* this.expression(entry)), this.budget);
          return value;
        }
        case 'unary': return unary(expression.operator, (yield* this.expression(expression.argument)), this.profile);
        case 'binary': {
          const left = (yield* this.expression(expression.left));
          if (expression.operator === '&&') return truth(left) ? (yield* this.expression(expression.right)) : left;
          if (expression.operator === '||') return truth(left) ? left : (yield* this.expression(expression.right));
          return binary(expression.operator, left, (yield* this.expression(expression.right)), this.profile, this.budget);
        }
        case 'conditional': return (yield* this.expression(truth((yield* this.expression(expression.condition))) ? expression.yes : expression.no));
        case 'assignment': {
          const reference = (yield* this.reference(expression.target));
          const previous = expression.operator === '=' ? null : reference.get();
          let value = (yield* this.expression(expression.value));
          if (previous) value = binary(expression.operator[0]!, previous, value, this.profile, this.budget);
          reference.set(value); return value;
        }
        case 'index': {
          const collection = (yield* this.expression(expression.collection));
          const key = (yield* this.withDollar(collection, function*(this: Evaluator) { return yield* this.expression(expression.index); }.bind(this)));
          return index(collection, key, this.budget);
        }
        case 'slice': {
          const collection = (yield* this.expression(expression.collection));
          return (yield* this.withDollar(collection, function*(this: Evaluator): Evaluation<MooValue> { return slice(collection, expression.start ? yield* this.expression(expression.start) : moo.int(1), expression.end ? yield* this.expression(expression.end) : moo.int(length(collection)), this.budget); }.bind(this)));
        }
        case 'call': {
          const args = (yield* this.args(expression.arguments));
          return (yield* this.host.builtin(expression.name, args, expression.span)) ?? invokeBuiltin(expression.name, args, { profile: this.profile, budget: this.budget });
        }
        case 'property': {
          const receiver = (yield* this.expression(expression.receiver)), name = (yield* this.expression(expression.name));
          if (receiver.type !== 'object' || name.type !== 'string') fail('E_TYPE');
          return this.host.world.getProperty(receiver.value, name.value, this.budget);
        }
        case 'verb-call': return (yield* this.host.call((yield* this.expression(expression.receiver)), (yield* this.expression(expression.name)), (yield* this.args(expression.arguments)), expression.span));
        case 'pass': return (yield* this.host.pass((yield* this.args(expression.arguments)), expression.span));
        case 'catch': {
          const codes = (yield* this.catchCodes(expression.codes));
          try { return (yield* this.expression(expression.body)); }
          catch (error) {
            if (!(error instanceof MooError) || !this.matches(codes, error)) throw error;
            return expression.fallback ? (yield* this.expression(expression.fallback)) : moo.error(error.code);
          }
        }
        case 'scatter': {
          const value = (yield* this.expression(expression.value));
          if (value.type !== 'list') fail('E_TYPE');
          const required = expression.entries.filter(e => e.mode === 'required').length;
          const optional = expression.entries.filter(e => e.mode === 'optional').length;
          const rest = expression.entries.some(e => e.mode === 'rest');
          if (value.value.length < required || (!rest && value.value.length > required + optional)) fail('E_ARGS');
          let remainingOptional = Math.min(optional, value.value.length - required), position = 0;
          const restSize = Math.max(0, value.value.length - required - optional);
          this.budget.allocate(expression.entries.length + restSize);
          const defaults: { name: string; expression: Expr }[] = [];
          for (const entry of expression.entries) {
            if (entry.mode === 'rest') { this.variables.set(entry.name, moo.list(value.value.slice(position, position + restSize))); position += restSize; }
            else if (entry.mode === 'required' || remainingOptional > 0) {
              if (entry.mode === 'optional') remainingOptional--;
              this.variables.set(entry.name, value.value[position++]!);
            } else if (entry.fallback) defaults.push({ name: entry.name, expression: entry.fallback });
          }
          for (const fallback of defaults) this.variables.set(fallback.name, (yield* this.expression(fallback.expression)));
          return value;
        }
        default: { const unhandled: never = expression; throw new HostError(`Unhandled expression: ${String(unhandled)}`); }
      }
    } catch (error) {
      if ((error instanceof MooError || error instanceof LimitError) && !error.span) error.span = expression.span;
      throw error;
    } finally { if (entered) this.budget.leave(); }
  }
  private *catchCodes(codes: CatchCodes): Evaluation<'any' | MooValue[]> { return codes === 'any' ? 'any' : (yield* this.args(codes)); }
  private matches(codes: 'any' | MooValue[], error: MooError): boolean {
    return codes === 'any' || codes.some(code => { this.budget.step(); return code.type === 'error' && code.value === error.code; });
  }
}
