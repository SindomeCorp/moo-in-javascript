import { HostError } from '../parser/index.js';
import type { WorldLimits } from '../world/index.js';
import type { SnapshotLimits } from '../snapshots/codec.js';

/** Conservative terminal capacity reserved from the world's configured quotas. */
export function transferCapacity(limits: Required<WorldLimits>): Required<SnapshotLimits> {
  // Six JSON characters per input UTF-16 unit covers escapes. Other terms cover
  // value tags, decimal IDs, flags, property metadata and complete verb records.
  const maxCharacters = 1024 + 6 * limits.stringUnits + 128 * limits.valueNodes
    + 512 * limits.objects + 256 * limits.properties + 512 * limits.verbs;
  const maxNodes = 20 + limits.stringUnits + 4 * limits.valueNodes + 20 * limits.objects
    + 10 * limits.properties + 12 * limits.verbs;
  if (!Number.isSafeInteger(maxCharacters) || !Number.isSafeInteger(maxNodes)) throw new HostError('World quotas exceed safe worker transfer capacity');
  return { maxCharacters, maxNodes, maxDepth: 512 };
}
