import { proxyActivities } from '@temporalio/workflow';

import type * as chargeActivities from '../activities/charge-activities';
import type { RetryInput, RetryResult } from '../activities/charge-activities';

const activities = proxyActivities<typeof chargeActivities>({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '1 second',
    backoffCoefficient: 1,
    maximumAttempts: 3,
  },
});

export async function retryWorkflow(input: RetryInput): Promise<RetryResult> {
  const charge = await activities.flakyCharge(input.orderId, input.failuresBeforeSuccess);

  return {
    orderId: input.orderId,
    authorizationId: charge.authorizationId,
    succeededOnAttempt: charge.succeededOnAttempt,
  };
}
