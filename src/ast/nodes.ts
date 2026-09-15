import type { SourceSpan } from './source.js';
import type { MooValue } from '../values/index.js';

type Located = { readonly span: SourceSpan };
export type Argument = { readonly splice: boolean; readonly expression: Expr };
export type CatchCodes = 'any' | readonly Argument[];
export interface ScatterEntry { name: string; mode: 'required' | 'optional' | 'rest'; fallback: Expr | null }
export type Expr = Located & (
  | { kind: 'literal'; value: MooValue }
  | { kind: 'variable'; name: string }
  | { kind: 'dollar' }
  | { kind: 'list'; entries: readonly Argument[] }
  | { kind: 'map'; entries: readonly (readonly [Expr, Expr])[] }
  | { kind: 'unary'; operator: string; argument: Expr }
  | { kind: 'binary'; operator: string; left: Expr; right: Expr }
  | { kind: 'conditional'; condition: Expr; yes: Expr; no: Expr }
  | { kind: 'assignment'; target: Target; value: Expr; operator: '=' | '+=' | '-=' }
  | { kind: 'index'; collection: Expr; index: Expr }
  | { kind: 'slice'; collection: Expr; start: Expr | null; end: Expr | null }
  | { kind: 'call'; name: string; arguments: readonly Argument[] }
  | { kind: 'property'; receiver: Expr; name: Expr }
  | { kind: 'verb-call'; receiver: Expr; name: Expr; arguments: readonly Argument[] }
  | { kind: 'pass'; arguments: readonly Argument[] }
  | { kind: 'catch'; body: Expr; codes: CatchCodes; fallback: Expr | null }
  | { kind: 'scatter'; entries: readonly ScatterEntry[]; value: Expr }
);
export type Target = Extract<Expr, { kind: 'variable' | 'property' }>
  | (Located & { kind: 'index'; collection: Target; index: Expr })
  | (Located & { kind: 'slice'; collection: Target; start: Expr | null; end: Expr | null });
export type Statement = Located & (
  | { kind: 'empty' }
  | { kind: 'expression'; expression: Expr }
  | { kind: 'return'; expression: Expr | null }
  | { kind: 'if'; branches: readonly { condition: Expr; body: readonly Statement[] }[]; otherwise: readonly Statement[] }
  | { kind: 'while'; condition: Expr; body: readonly Statement[] }
  | { kind: 'for'; variable: string; collection: Expr | { kind: 'range'; start: Expr; end: Expr }; body: readonly Statement[] }
  | { kind: 'break' | 'continue'; label: string | null }
  | { kind: 'try'; body: readonly Statement[]; handlers: readonly { variable: string | null; codes: CatchCodes; body: readonly Statement[] }[]; finally: readonly Statement[] | null }
);
