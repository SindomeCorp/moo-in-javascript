import type { SourceSpan } from '../ast/source.js';
import { moo, type ErrorCode, type MooValue } from '../values/index.js';

export const errorMessages: Record<ErrorCode, string> = {
  E_FILE: 'File error', E_EXEC: 'Exec error', E_INTRPT: 'Interrupted',
  E_NONE: 'No error', E_TYPE: 'Type mismatch', E_DIV: 'Division by zero', E_PERM: 'Permission denied',
  E_PROPNF: 'Property not found', E_VERBNF: 'Verb not found', E_VARNF: 'Variable not found',
  E_INVIND: 'Invalid indirection', E_RECMOVE: 'Recursive move', E_MAXREC: 'Too many verb calls',
  E_RANGE: 'Range error', E_ARGS: 'Incorrect number of arguments', E_NACC: 'Move refused by destination',
  E_INVARG: 'Invalid argument', E_QUOTA: 'Resource limit exceeded', E_FLOAT: 'Floating-point arithmetic error',
};
export interface CallFrame { this: bigint; definer: bigint; player: bigint; caller: bigint; programmer: bigint; verb: string; span?: SourceSpan }

export class MooError extends Error {
  override readonly name = 'MooError';
  span?: SourceSpan;
  frames?: readonly CallFrame[];
  constructor(readonly code: ErrorCode, message: string = errorMessages[code], readonly value: MooValue = moo.int(0)) { super(message); }
}
export class LimitError extends Error {
  override readonly name = 'LimitError';
  span?: SourceSpan;
  frames?: readonly CallFrame[];
  constructor(readonly resource: string) { super(`Execution ${resource} limit exceeded`); }
}
export function fail(code: ErrorCode, message?: string): never { throw new MooError(code, message); }

export class UnsupportedSourceError extends Error {
  constructor(readonly diagnostics: readonly import('../ast/source.js').Diagnostic[]) { super(diagnostics.map(d=>d.message).join('; ')); }
}
