import { deprecatePatch, patched, proxyActivities } from '@temporalio/workflow';

import type * as chargeActivities from '../activities/charge-activities';
import type { PatchedInput, PatchedResult } from '../activities/charge-activities';

const activities = proxyActivities<typeof chargeActivities>({
  startToCloseTimeout: '1 minute',
});

export async function patchedWorkflow(input: PatchedInput): Promise<PatchedResult> {
  deprecatePatch('legacy-tax-rounding');

  const receipt = patched('use-modern-charge')
    ? await activities.newCharge(input.orderId)
    : await activities.oldCharge(input.orderId);

  return {
    orderId: input.orderId,
    chargeId: receipt.chargeId,
    processor: receipt.processor,
  };
}
