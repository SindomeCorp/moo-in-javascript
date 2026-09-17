import type { ParserOptions, ParseResult } from '../parser/index.js';
import type { EncodedValue } from '../values/index.js';
import type { Limits, Statistics } from '../runtime/budget.js';
import type { WorldLimits } from '../world/index.js';
import type { Diagnostic, SourceSpan } from '../ast/source.js';
import type { ErrorCode } from '../values/index.js';

export interface ParseRequest { type: 'parse'; id: string; source: string; options: ParserOptions }
export interface WireContext { this?: EncodedValue; player?: EncodedValue; caller?: EncodedValue; args?: EncodedValue[]; verb?: string }
export interface ExecuteRequest {
  unsupportedSourcePolicy?: 'reject' | 'retain';
  type: 'execute'; id: string; source: string; options: ParserOptions;
  snapshot: string; worldLimits: WorldLimits; limits?: Limits; context?: WireContext;
}
export type WarmupRequest = Omit<ExecuteRequest, 'type' | 'source' | 'context' | 'limits'> & {type:'warmup'};
export interface WireFrame { this: string; definer: string; player: string; caller: string; programmer: string; verb: string; span?: SourceSpan }
export interface WireRuntimeDiagnostic { category: 'runtime-error' | 'limit-exceeded'; message: string; code?: ErrorCode; span?: SourceSpan; stack: WireFrame[] }
export interface WireOutput { runId: string; sequence: number; recipient: EncodedValue; text: string }
export type WireResult = { statistics: Statistics; commit: 'committed' | 'discarded' } & (
  | { status: 'completed'; value: EncodedValue; diagnostics: readonly [] }
  | { status: 'runtime-error' | 'limit-exceeded'; diagnostics: readonly WireRuntimeDiagnostic[] }
  | { status: 'syntax-error' | 'unsupported-feature'; diagnostics: readonly Diagnostic[] }
);
export type WorkerRequest = ParseRequest | ExecuteRequest | WarmupRequest;
export type WorkerResponse = {type:'warmed';id:string}
  | { type: 'parsed'; id: string; result: ParseResult }
  | { type: 'output'; id: string; event: WireOutput }
  | { type: 'terminal'; id: string; result: WireResult; snapshot: string; outputCount: number }
  | { type: 'host-error'; id: string; message: string };
