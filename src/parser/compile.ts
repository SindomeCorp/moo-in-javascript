import type { Diagnostic, SyntaxNode } from '../ast/source.js';
import type { Expr, Target, Argument, Statement, CatchCodes, ScatterEntry } from '../ast/nodes.js';
import { moo, errorCodes, type ErrorCode } from '../values/index.js';
import { fold } from '../values/operations.js';
import type { Profile } from './index.js';

class Rejection extends Error {
  constructor(readonly diagnostic: Diagnostic) { super(diagnostic.message); }
}
const children = (n: SyntaxNode) => n.children.filter(c => c.named);
function field(n: SyntaxNode, name: string): SyntaxNode { return n.children.find(c => c.field === name)!; }
function reject(n: SyntaxNode, message: string, category: Diagnostic['category'] = 'unsupported-feature'): never {
  throw new Rejection({ category, message, span: n.span });
}

export function lower(syntax: SyntaxNode, profile: Profile): { ok: true; body: readonly Statement[] } | { ok: false; diagnostics: Diagnostic[] } {
  let depth = 0, dollarDepth = 0;
  const loops: (string | null)[] = [];
  function expression(n: SyntaxNode): Expr {
    if (++depth > 200) reject(n, 'Expression nesting exceeds the supported compile depth');
    try {
      const named = children(n), span = n.span;
      switch (n.kind) {
        case 'integer': case 'object_reference': {
          const text = n.kind === 'integer' ? n.text : n.text.slice(1);
          if (text.length > 20) reject(n, 'Integer literal outside profile range', 'syntax-error');
          const value = BigInt(text), bits = profile === 'lambdamoo' ? 32n : 64n;
          if (value < -(1n << (bits - 1n)) || value >= (1n << (bits - 1n))) reject(n, 'Integer literal outside profile range', 'syntax-error');
          return { kind: 'literal', value: n.kind === 'integer' ? moo.int(value) : moo.object(value), span };
        }
        case 'float': {
          const value = Number(n.text);
          if (!Number.isFinite(value)) reject(n, 'Float literal must be finite', 'syntax-error');
          return { kind: 'literal', value: moo.float(value), span };
        }
        case 'string': {
          const value = n.text.slice(1, -1).replace(/\\(.)/gs, '$1');
          if (/[^\x09\x20-\x7e]/.test(value)) reject(n, 'Only printable ASCII and tab string characters are currently supported');
          return { kind: 'literal', value: moo.string(value), span };
        }
        case 'error_constant':
          if(profile==='lambdamoo' && errorCodes.indexOf(n.text as ErrorCode)>15) reject(n, `${n.text} requires ToastStunt`);
          if (!errorCodes.includes(n.text as ErrorCode)) reject(n, `Unknown error constant ${n.text}`, 'syntax-error');
          return { kind: 'literal', value: moo.error(n.text as ErrorCode), span };
        case 'type_constant': {
          if (profile === 'toaststunt' && ['WAIF', 'ANON'].includes(n.text)) return { kind: 'literal', value: moo.int(n.text === 'WAIF' ? 13 : 12), span };
          const tags = { INT: 'int', NUM: 'int', OBJ: 'object', STR: 'string', ERR: 'error', LIST: 'list', FLOAT: 'float', MAP: 'map' } as const;
          const tag = tags[n.text as keyof typeof tags];
          if (!tag || (tag === 'map' && profile === 'lambdamoo')) reject(n, `${n.text} type is unsupported in ${profile}`);
          return { kind: 'variable', name: fold(n.text), span };
        }
        case 'identifier': return { kind: 'variable', name: fold(n.text), span };
        case 'dollar': if (!dollarDepth) reject(n, '$ requires enclosing index or slice brackets', 'syntax-error'); return { kind: 'dollar', span };
        case 'parenthesized_expression': return expression(named[0]!);
        case 'list_literal': return { kind: 'list', entries: named.map(argument), span };
        case 'map_literal': return { kind: 'map', entries: named.map(entry => [expression(field(entry, 'key')), expression(field(entry, 'value'))]), span };
        case 'unary_expression': {
          const operator = field(n, 'operator').text;
          if (!['-', '!'].includes(operator)) reject(n, `Unary ${operator} is not supported`);
          // The most negative integer is lexed as unary minus plus positive magnitude.
          const arg = field(n, 'argument');
          if (operator === '-' && arg.kind === 'integer' && arg.text === String(1n << (profile === 'lambdamoo' ? 31n : 63n))) {
            return { kind: 'literal', value: moo.int(-BigInt(arg.text)), span };
          }
          return { kind: 'unary', operator, argument: expression(arg), span };
        }
        case 'binary_expression': {
          const operator = field(n, 'operator').text;
          if (!['+', '-', '*', '/', '%', '^', '==', '!=', '<', '<=', '>', '>=', 'in', '&&', '||'].includes(operator)) reject(n, `Binary ${operator || 'not in'} is not supported`);
          return { kind: 'binary', operator, left: expression(field(n, 'left')), right: expression(field(n, 'right')), span };
        }
        case 'conditional_expression': return { kind: 'conditional', condition: expression(field(n, 'condition')), yes: expression(field(n, 'consequence')), no: expression(field(n, 'alternative')), span };
        case 'assignment_expression': case 'assignment_statement': {
          const operator = n.children.find(c => ['=', '+=', '-='].includes(c.text))?.text as '=' | '+=' | '-=';
          if (!operator) reject(n, 'Missing assignment operator', 'syntax-error');
          const left = field(n, 'left');
          if (left.kind === 'scatter_pattern') {
            if (operator !== '=') reject(n, 'Scatter assignment requires =', 'syntax-error');
            const entries: ScatterEntry[] = children(left).map(entry => {
              if (entry.kind === 'identifier') return { name: fold(entry.text), mode: 'required', fallback: null };
              const fallback = field(entry, 'default');
              return { name: fold(field(entry, 'name').text), mode: entry.kind === 'rest_scatter_element' ? 'rest' : 'optional', fallback: fallback ? expression(fallback) : null };
            });
            if (entries.filter(e => e.mode === 'rest').length > 1) reject(left, 'Scatter permits at most one rest target', 'syntax-error');
            return { kind: 'scatter', entries, value: expression(field(n, 'right')), span };
          }
          return { kind: 'assignment', operator, target: target(field(n, 'left')), value: expression(field(n, 'right')), span };
        }
        case 'inline_error_expression': {
          const body = field(n, 'body'), fallback = field(n, 'fallback');
          return { kind: 'catch', body: expression(body), codes: codes(named.filter(c => c !== body && c !== fallback)), fallback: fallback ? expression(fallback) : null, span };
        }
        case 'index_expression': case 'range_expression': {
          const collection = expression(field(n, 'collection'));
          dollarDepth++;
          try {
            if (n.kind === 'index_expression') return { kind: 'index', collection, index: expression(field(n, 'index')), span };
            const start = field(n, 'start'), end = field(n, 'end');
            return { kind: 'slice', collection, start: start ? expression(start) : null, end: end ? expression(end) : null, span };
          } finally { dollarDepth--; }
        }
        case 'function_call': {
          const name = field(n, 'function');
          if (name.kind === 'system_object') return { kind: 'verb-call', receiver: { kind: 'literal', value: moo.object(0), span }, name: { kind: 'literal', value: moo.string(name.text.slice(1)), span }, arguments: children(field(n, 'arguments')).map(argument), span };
          return { kind: 'call', name: fold(name.text), arguments: children(field(n, 'arguments')).map(argument), span };
        }
        case 'system_object': return { kind: 'property', receiver: { kind: 'literal', value: moo.object(0), span }, name: { kind: 'literal', value: moo.string(n.text.slice(1)), span }, span };
        case 'property_access': case 'computed_property_access': {
          const name = field(n, 'property');
          return { kind: 'property', receiver: expression(field(n, 'receiver')), name: n.kind === 'property_access' ? { kind: 'literal', value: moo.string(name.text), span: name.span } : expression(name), span };
        }
        case 'verb_call': {
          const name = field(n, 'verb');
          return { kind: 'verb-call', receiver: expression(field(n, 'receiver')), name: name.kind === 'identifier' ? { kind: 'literal', value: moo.string(name.text), span: name.span } : expression(field(name, 'name')),
            arguments: children(field(n, 'arguments')).map(argument), span };
        }
        case 'pass_call': return { kind: 'pass', arguments: children(field(n, 'arguments')).map(argument), span };
        default: return reject(n, `${n.kind} is not implemented yet`);
      }
    } finally { depth--; }
  }
  function target(n: SyntaxNode): Target {
    const result = expression(n);
    function validate(e: Expr): e is Target {
      return e.kind === 'variable' || e.kind === 'property' || ((e.kind === 'index' || e.kind === 'slice') && validate(e.collection));
    }
    if (!validate(result)) reject(n, 'Assignment requires a variable or indexed/sliced variable', 'syntax-error');
    return result;
  }
  function argument(n: SyntaxNode): Argument {
    // Native @condition ? list | list splices the entire conditional argument.
    if (n.kind === 'conditional_expression' && field(n, 'condition')?.kind === 'splice_expression') {
      const condition = field(n, 'condition');
      const unwrapped = {...children(condition)[0]!, field: 'condition'};
      return {splice:true, expression:expression({...n, children:n.children.map(c => c === condition ? unwrapped : c)})};
    }
    return n.kind === 'splice_expression' ? { splice: true, expression: expression(children(n)[0]!) } : { splice: false, expression: expression(n) };
  }
  function codes(nodes: SyntaxNode[]): CatchCodes {
    if (nodes.length === 1 && nodes[0]!.kind === 'identifier' && nodes[0]!.text.toUpperCase() === 'ANY') return 'any';
    return nodes.map(argument);
  }
  function statement(n: SyntaxNode): Statement {
    if (++depth > 200) reject(n, 'Statement nesting exceeds the supported compile depth');
    try {
      const span = n.span, named = children(n);
      switch (n.kind) {
        case 'comment': expression(named[0]!); return { kind: 'empty', span };
        case 'empty_statement': return { kind: 'empty', span };
        case 'expression_statement': return { kind: 'expression', expression: expression(named[0]!), span };
        case 'assignment_statement': return { kind: 'expression', expression: expression(n), span };
        case 'return_statement': return { kind: 'return', expression: named.length ? expression(named[0]!) : null, span };
        case 'if_statement': {
          const branches: { condition: Expr; body: Statement[] }[] = [];
          const condition = field(n, 'condition');
          const body = named.filter(c => c !== condition && c.kind !== 'elseif_clause' && c.kind !== 'else_clause').map(statement);
          branches.push({ condition: expression(condition), body });
          for (const clause of named.filter(c => c.kind === 'elseif_clause')) {
            const cond = field(clause, 'condition');
            branches.push({ condition: expression(cond), body: children(clause).filter(c => c !== cond).map(statement) });
          }
          const other = named.find(c => c.kind === 'else_clause');
          return { kind: 'if', branches, otherwise: other ? children(other).map(statement) : [], span };
        }
        case 'while_statement': {
          const cond = field(n, 'condition');
          const condition = expression(cond);
          loops.push(null);
          try { return { kind: 'while', condition, body: named.filter(c => c !== cond).map(statement), span }; }
          finally { loops.pop(); }
        }
        case 'for_statement': {
          const key = field(n, 'key');
          if (key && profile !== 'toaststunt') reject(n, 'Two-variable iteration requires ToastStunt');
          const name = field(n, 'value'), source = field(n, 'collection');
          const variable = fold(name.text);
          let collection: Expr | { kind: 'range'; start: Expr; end: Expr };
          if (source.kind === 'range_literal') {
            if (!field(source, 'start') || !field(source, 'end')) reject(source, 'Range loops require both bounds', 'syntax-error');
            collection = { kind: 'range', start: expression(field(source, 'start')), end: expression(field(source, 'end')) };
          } else collection = expression(source);
          loops.push(variable);
          try { return { kind: 'for', variable, ...(key ? {key:fold(key.text)} : {}), collection, body: named.filter(c => c !== name && c !== source && c !== key).map(statement), span }; }
          finally { loops.pop(); }
        }
        case 'break_statement': case 'continue_statement': {
          const labelNode = field(n, 'label'), label = labelNode ? fold(labelNode.text) : null;
          if (!loops.length || (label && !loops.includes(label))) reject(n, 'Loop control must target an enclosing loop', 'syntax-error');
          return { kind: n.kind === 'break_statement' ? 'break' : 'continue', label, span };
        }
        case 'try_statement': {
          const clauses = named.filter(c => c.kind === 'except_clause');
          if (clauses.length > 255) reject(n, 'At most 255 except clauses are supported', 'syntax-error');
          const final = named.find(c => c.kind === 'finally_clause');
          const handlers = clauses.map(clause => {
            if (field(clause, 'handler_value')) reject(clause, 'Except => handlers are outside the supported syntax');
            const variable = field(clause, 'variable');
            const codeNodes: SyntaxNode[] = [], bodyNodes: SyntaxNode[] = [];
            let inBody = false;
            for (const child of children(clause)) {
              if (child === variable) continue;
              if (child.kind.endsWith('_statement') || child.kind === 'comment') inBody = true;
              (inBody ? bodyNodes : codeNodes).push(child);
            }
            return { variable: variable ? fold(variable.text) : null, codes: codes(codeNodes), body: bodyNodes.map(statement) };
          });
          return { kind: 'try', body: named.filter(c => c.kind !== 'except_clause' && c.kind !== 'finally_clause').map(statement), handlers,
            finally: final ? children(final).map(statement) : null, span };
        }
        default: return reject(n, `${n.kind} is not implemented yet`);
      }
    } finally { depth--; }
  }
  try { return { ok: true, body: children(syntax).map(statement) }; }
  catch (error) { if (error instanceof Rejection) return { ok: false, diagnostics: [error.diagnostic] }; throw error; }
}
