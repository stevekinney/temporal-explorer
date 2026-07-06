import { proxyActivities } from '@temporalio/workflow';

import type * as flagActivities from '../activities/flag-activities';
import type { FlagInput, FlagResult } from '../activities/flag-activities';

const { applyFlag } = proxyActivities<typeof flagActivities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Applies configuration flags with a `for ... in` loop over an object's own keys, so the
 * control-flow model emits a `loop` region of kind `for-in` whose body guards inherited
 * keys with a `continue`. Object keys iterate in insertion order, so the committed history
 * applies the flags deterministically.
 */
export async function flagWorkflow(input: FlagInput): Promise<FlagResult> {
  let applied = 0;

  for (const flag in input.flags) {
    if (!Object.prototype.hasOwnProperty.call(input.flags, flag)) {
      continue;
    }

    await applyFlag(input.configId, flag);
    applied += 1;
  }

  return { configId: input.configId, applied };
}
