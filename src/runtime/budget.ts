import { HostError } from '../parser/index.js';
import { LimitError } from './errors.js';

export interface Limits { steps?: number; allocations?: number; evaluationDepth?: number; callDepth?: number; outputCharacters?: number; outputEvents?: number }
export interface Statistics { steps: number; allocations: number; peakEvaluationDepth: number; peakCallDepth: number; outputCharacters: number; outputEvents: number }
export class Budget {
  readonly stats: Statistics = { steps: 0, allocations: 0, peakEvaluationDepth: 0, peakCallDepth: 0, outputCharacters: 0, outputEvents: 0 };
  readonly limits: Required<Limits>;
  #depth = 0;
  constructor(limits: Limits = {}) {
    this.limits = { steps: limits.steps ?? 100_000, allocations: limits.allocations ?? 1_000_000,
      evaluationDepth: limits.evaluationDepth ?? 200, callDepth: limits.callDepth ?? 50, outputCharacters: limits.outputCharacters ?? 20_000, outputEvents: limits.outputEvents ?? 1000 };
    for (const value of Object.values(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 0) throw new HostError('Limits must be nonnegative safe integers');
    }
    if (this.limits.evaluationDepth > 256) throw new HostError('evaluationDepth cannot exceed 256');
    if (this.limits.callDepth > 100) throw new HostError('callDepth cannot exceed 100');
  }
  step(count = 1): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new HostError('Step charges must be nonnegative safe integers');
    if (count > this.limits.steps - this.stats.steps) throw new LimitError('steps');
    this.stats.steps += count;
  }
  allocate(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new HostError('Allocation charges must be nonnegative safe integers');
    if (count > this.limits.allocations - this.stats.allocations) throw new LimitError('allocations');
    this.stats.allocations += count;
  }
  enter(): void {
    if (this.#depth >= this.limits.evaluationDepth) throw new LimitError('evaluationDepth');
    this.#depth++;
    this.stats.peakEvaluationDepth = Math.max(this.stats.peakEvaluationDepth, this.#depth);
  }
  leave(): void { this.#depth--; }
  call(depth: number): void {
    if (depth > this.limits.callDepth) throw new LimitError('callDepth');
    this.stats.peakCallDepth = Math.max(this.stats.peakCallDepth, depth);
  }
  output(characters: number): void {
    if (characters > this.limits.outputCharacters - this.stats.outputCharacters || this.stats.outputEvents >= this.limits.outputEvents) throw new LimitError('output');
    this.allocate(characters + 1); this.stats.outputCharacters += characters; this.stats.outputEvents++;
  }
}
