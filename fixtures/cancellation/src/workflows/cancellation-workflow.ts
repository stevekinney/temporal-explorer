import { CancellationScope, isCancellation, proxyActivities, sleep } from '@temporalio/workflow';

import type * as resourceActivities from '../activities/resource-activities';
import type { CancellationInput, CancellationResult } from '../activities/resource-activities';

const activities = proxyActivities<typeof resourceActivities>({
  startToCloseTimeout: '1 minute',
});

export async function cancellationWorkflow(input: CancellationInput): Promise<CancellationResult> {
  try {
    await CancellationScope.cancellable(async () => {
      await activities.reserveResources(input.resourceId);
      await sleep('30 days');
      await activities.useResources(input.resourceId);
    });

    return {
      resourceId: input.resourceId,
      outcome: 'completed',
    };
  } catch (error) {
    if (!isCancellation(error)) {
      throw error;
    }

    await CancellationScope.nonCancellable(async () => {
      await activities.releaseResources(input.resourceId);
    });

    throw error;
  }
}
