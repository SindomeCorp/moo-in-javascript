import type { Evaluation } from './suspension.js';
import type { MooValue } from '../values/index.js';
import type { World } from '../world/index.js';
import type { MooError } from './errors.js';
import type { SourceSpan } from '../ast/source.js';

export interface EvaluationHost {
  world: World;
  call(receiver: MooValue, name: MooValue, args: MooValue[], span: SourceSpan): Evaluation<MooValue>;
  pass(args: MooValue[], span: SourceSpan): Evaluation<MooValue>;
  builtin(name: string, args: MooValue[], span: SourceSpan): Evaluation<MooValue | undefined>;
  traceback(error: MooError): MooValue;
}
