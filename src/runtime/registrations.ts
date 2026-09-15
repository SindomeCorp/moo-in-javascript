import type { World } from '../world/index.js';
import { moo, type MooValue, type ErrorCode } from '../values/index.js';
import { MooError, type CallFrame } from './errors.js';
import { HostError } from '../parser/index.js';

export interface HostVerbContext {
  readonly world: World;
  readonly frame: Readonly<CallFrame>;
  readonly args: readonly MooValue[];
  notify(recipient: MooValue, text: string): void;
  chargeSteps(count: number): void;
  chargeAllocations(count: number): void;
  raise(code: ErrorCode, message?: string, value?: MooValue): never;
}
export type HostVerb = (context: HostVerbContext) => MooValue;
export type HostVerbRegistrations = Readonly<Record<string, HostVerb>>;
export class HostRaisedError extends MooError {}
export function raiseFromHost(code: ErrorCode, message?: string, value?: MooValue): never {
  moo.error(code);
  if (message !== undefined && typeof message !== 'string') throw new HostError('Host error messages must be strings');
  if (value !== undefined) moo.list([value]);
  throw new HostRaisedError(code, message, value);
}
