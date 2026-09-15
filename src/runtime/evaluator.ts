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

  evaluate(body: readonly Statement[]): MooValue {
    const flow = this.block(body);
    return flow?.kind === 'return' ? flow.value : moo.int(0);
  }
  private block(body: readonly Statement[]): Flow {
    for (const statement of body) { const flow = this.statement(statement); if (flow) return flow; }
    return undefined;
  }
  private statement(statement: Statement): Flow {
    try {
    this.budget.step();
    switch (statement.kind) {
      case 'empty': return;
      case 'expression': this.expression(statement.expression); return;
      case 'return': return { kind: 'return', value: statement.expression ? this.expression(statement.expression) : moo.int(0) };
      case 'break': case 'continue': return { kind: statement.kind, label: statement.label };
      case 'if':
        for (const branch of statement.branches) if (truth(this.expression(branch.condition))) return this.block(branch.body);
        return this.block(statement.otherwise);
      case 'while':
        while (truth(this.expression(statement.condition))) {
          const flow = this.block(statement.body);
          if (flow?.kind === 'return' || (flow && flow.label !== null)) return flow;
          if (flow?.kind === 'break') break;
        }
        return;
      case 'for': {
        const run = (value: MooValue): Flow => {
          this.budget.step(); this.variables.set(statement.variable, value);
          return this.block(statement.body);
        };
        const handles = (flow: Exclude<Flow, undefined>) => flow.kind !== 'return' && (flow.label === null || flow.label === statement.variable);
        if (statement.collection.kind === 'range') {
          const start = this.expression(statement.collection.start), end = this.expression(statement.collection.end);
          if (start.type !== 'int' || end.type !== 'int') fail('E_TYPE');
          for (let i = start.value; i <= end.value; i++) {
            const flow = run(moo.int(i));
            if (flow && !handles(flow)) return flow;
            if (flow?.kind === 'break') break;
          }
        } else {
          const collection = this.expression(statement.collection);
          if (collection.type !== 'list') fail('E_TYPE');
          for (const item of collection.value) {
            const flow = run(item);
            if (flow && !handles(flow)) return flow;
            if (flow?.kind === 'break') break;
          }
        }
        return;
      }
      case 'try': {
        if (statement.finally !== null) {
          let flow: Flow, pending: MooError | undefined;
          try { flow = this.block(statement.body); }
          catch (error) { if (!(error instanceof MooError)) throw error; pending = error; }
          const cleanup = this.block(statement.finally);
          if (cleanup) return cleanup;
          if (pending) throw pending;
          return flow;
        }
        const handlers = statement.handlers.map(handler => ({ ...handler, values: this.catchCodes(handler.codes) }));
        try { return this.block(statement.body); }
        catch (error) {
          if (!(error instanceof MooError)) throw error;
          const handler = handlers.find(handler => this.matches(handler.values, error));
          if (!handler) throw error;
          if (handler.variable) {
            this.budget.allocate(4 + error.message.length);
            this.variables.set(handler.variable, moo.list([moo.error(error.code), moo.string(error.message), error.value, this.host.traceback(error)]));
          }
          return this.block(handler.body);
        }
      }
    }
    } catch (error) {
      if ((error instanceof MooError || error instanceof LimitError) && !error.span) error.span = statement.span;
      throw error;
    }
  }
  private withDollar<T>(collection: MooValue, fn: () => T): T {
    this.#dollars.push(moo.int(length(collection)));
    try { return fn(); } finally { this.#dollars.pop(); }
  }
  private args(entries: readonly Argument[]): MooValue[] {
    const values: MooValue[] = [];
    for (const arg of entries) {
      const value = this.expression(arg.expression);
      if (arg.splice) {
        if (value.type !== 'list') fail('E_TYPE');
        this.budget.allocate(value.value.length);
        for (const item of value.value) values.push(item);
      } else { this.budget.allocate(1); values.push(value); }
    }
    return values;
  }
  private reference(target: Target): Reference {
    if (target.kind === 'variable') {
      return { get: () => this.variables.get(target.name) ?? fail('E_VARNF', `Variable ${target.name} has no value`),
        set: value => { this.variables.set(target.name, value); } };
    }
    if (target.kind === 'property') {
      const receiver = this.expression(target.receiver), name = this.expression(target.name);
      if (receiver.type !== 'object' || name.type !== 'string') fail('E_TYPE');
      return { get: () => this.host.world.getProperty(receiver.value, name.value, this.budget),
        set: value => this.host.world.setProperty(receiver.value, name.value, value, this.budget) };
    }
    const parent = this.reference(target.collection), collection = parent.get();
    if (target.kind === 'index') {
      const key = this.withDollar(collection, () => this.expression(target.index));
      return { get: () => index(collection, key, this.budget), set: value => parent.set(replaceIndex(collection, key, value, this.budget)) };
    }
    const [start, end] = this.withDollar(collection, () => [target.start ? this.expression(target.start) : moo.int(1),
      target.end ? this.expression(target.end) : moo.int(length(collection))]);
    return { get: () => slice(collection, start!, end!, this.budget),
      set: value => parent.set(replaceSlice(collection, start!, end!, value, this.budget)) };
  }
  expression(expression: Expr): MooValue {
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
        case 'list': return moo.list(this.args(expression.entries));
        case 'map': {
          let value = moo.map([]);
          for (const [key, entry] of expression.entries) value = mapSet(value, this.expression(key), this.expression(entry), this.budget);
          return value;
        }
        case 'unary': return unary(expression.operator, this.expression(expression.argument), this.profile);
        case 'binary': {
          const left = this.expression(expression.left);
          if (expression.operator === '&&') return truth(left) ? this.expression(expression.right) : left;
          if (expression.operator === '||') return truth(left) ? left : this.expression(expression.right);
          return binary(expression.operator, left, this.expression(expression.right), this.profile, this.budget);
        }
        case 'conditional': return this.expression(truth(this.expression(expression.condition)) ? expression.yes : expression.no);
        case 'assignment': {
          const reference = this.reference(expression.target);
          const previous = expression.operator === '=' ? null : reference.get();
          let value = this.expression(expression.value);
          if (previous) value = binary(expression.operator[0]!, previous, value, this.profile, this.budget);
          reference.set(value); return value;
        }
        case 'index': {
          const collection = this.expression(expression.collection);
          const key = this.withDollar(collection, () => this.expression(expression.index));
          return index(collection, key, this.budget);
        }
        case 'slice': {
          const collection = this.expression(expression.collection);
          return this.withDollar(collection, () => slice(collection,
            expression.start ? this.expression(expression.start) : moo.int(1),
            expression.end ? this.expression(expression.end) : moo.int(length(collection)), this.budget));
        }
        case 'call': {
          const args = this.args(expression.arguments);
          return this.host.builtin(expression.name, args, expression.span) ?? invokeBuiltin(expression.name, args, { profile: this.profile, budget: this.budget });
        }
        case 'property': {
          const receiver = this.expression(expression.receiver), name = this.expression(expression.name);
          if (receiver.type !== 'object' || name.type !== 'string') fail('E_TYPE');
          return this.host.world.getProperty(receiver.value, name.value, this.budget);
        }
        case 'verb-call': return this.host.call(this.expression(expression.receiver), this.expression(expression.name), this.args(expression.arguments), expression.span);
        case 'pass': return this.host.pass(this.args(expression.arguments), expression.span);
        case 'catch': {
          const codes = this.catchCodes(expression.codes);
          try { return this.expression(expression.body); }
          catch (error) {
            if (!(error instanceof MooError) || !this.matches(codes, error)) throw error;
            return expression.fallback ? this.expression(expression.fallback) : moo.error(error.code);
          }
        }
        case 'scatter': {
          const value = this.expression(expression.value);
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
          for (const fallback of defaults) this.variables.set(fallback.name, this.expression(fallback.expression));
          return value;
        }
        default: { const unhandled: never = expression; throw new HostError(`Unhandled expression: ${String(unhandled)}`); }
      }
    } catch (error) {
      if ((error instanceof MooError || error instanceof LimitError) && !error.span) error.span = expression.span;
      throw error;
    } finally { if (entered) this.budget.leave(); }
  }
  private catchCodes(codes: CatchCodes): 'any' | MooValue[] { return codes === 'any' ? 'any' : this.args(codes); }
  private matches(codes: 'any' | MooValue[], error: MooError): boolean {
    return codes === 'any' || codes.some(code => { this.budget.step(); return code.type === 'error' && code.value === error.code; });
  }
}
