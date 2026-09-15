import type { World } from '../world/index.js';
import type { Runtime, ExecuteOptions, ExecutionResult } from './index.js';
import type { SnapshotLimits } from '../snapshots/codec.js';

export type SessionRunOptions = Omit<ExecuteOptions, 'world'>;
export function createSession(options: { runtime: Runtime; world: World }): WorldSession {
  return new WorldSession(options.runtime, options.world);
}
/** Explicit retained state, an initial reset baseline, and optional fresh attempts. */
export class WorldSession {
  readonly #initial: string;
  constructor(readonly runtime: Runtime, readonly world: World) {
    this.#initial = runtime.saveWorld(world);
    // Validate baseline source/registrations now so Reset cannot discover stale code.
    runtime.loadWorld(this.#initial, { worldLimits: world.limits });
  }
  run(source: string, options: SessionRunOptions = {}): ExecutionResult {
    return this.runtime.run(source, { ...options, world: this.world });
  }
  runFresh(source: string, options: SessionRunOptions = {}): { result: ExecutionResult; world: World } {
    const world = this.runtime.loadWorld(this.#initial, { worldLimits: this.world.limits });
    return { result: this.runtime.run(source, { ...options, world }), world };
  }
  save(limits?: SnapshotLimits): string { return this.runtime.saveWorld(this.world, limits); }
  load(input: unknown, limits?: SnapshotLimits): void {
    this.runtime.loadWorld(input, { world: this.world, ...(limits === undefined ? {} : { limits }) });
  }
  reset(): void { this.runtime.loadWorld(this.#initial, { world: this.world }); }
}
