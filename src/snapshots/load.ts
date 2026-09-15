import { createRuntime, type RuntimeOptions } from '../runtime/index.js';
import type { World } from '../world/index.js';
import { snapshotProfile, type LoadWorldOptions } from './codec.js';

export interface StandaloneLoadOptions extends LoadWorldOptions {
  grammarWasm?: RuntimeOptions['grammarWasm'];
  runtimeWasm?: RuntimeOptions['runtimeWasm'];
  hostVerbs?: RuntimeOptions['hostVerbs'];
}
/** Uses the saved profile; source is recompiled without executing any verbs. */
export async function loadWorld(input: unknown, options: StandaloneLoadOptions = {}): Promise<World> {
  const profile = snapshotProfile(input, options.limits);
  const configuration: RuntimeOptions = { profile };
  if (options.grammarWasm !== undefined) configuration.grammarWasm = options.grammarWasm;
  if (options.runtimeWasm !== undefined) configuration.runtimeWasm = options.runtimeWasm;
  if (options.hostVerbs !== undefined) configuration.hostVerbs = options.hostVerbs;
  const runtime = await createRuntime(configuration);
  try { return runtime.loadWorld(input, options); }
  finally { runtime.dispose(); }
}
