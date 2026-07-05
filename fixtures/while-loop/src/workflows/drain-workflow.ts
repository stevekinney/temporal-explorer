import { proxyActivities } from '@temporalio/workflow';

import type * as drainActivities from '../activities/drain-activities';
import type { DrainInput, DrainResult } from '../activities/drain-activities';

const { drainOne } = proxyActivities<typeof drainActivities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Drains a bounded queue with a `while` loop, so the control-flow model emits a `loop`
 * region of kind `while`. The counter is decremented each pass, so the committed history
 * (count 3) drains three messages deterministically.
 */
export async function drainWorkflow(input: DrainInput): Promise<DrainResult> {
  let remaining = input.count;
  let drained = 0;

  while (remaining > 0) {
    await drainOne(input.queueId, remaining);
    remaining -= 1;
    drained += 1;
  }

  return { queueId: input.queueId, drained };
}
