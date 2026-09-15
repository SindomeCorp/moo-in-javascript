import type { MooValue } from '../values/index.js';
import type { World } from '../world/index.js';
import type { MooError } from './errors.js';
import type { SourceSpan } from '../ast/source.js';

export interface EvaluationHost {
  world: World;
  call(receiver: MooValue, name: MooValue, args: MooValue[], span: SourceSpan): MooValue;
  pass(args: MooValue[], span: SourceSpan): MooValue;
  builtin(name: string, args: MooValue[], span: SourceSpan): MooValue | undefined;
  traceback(error: MooError): MooValue;
}
