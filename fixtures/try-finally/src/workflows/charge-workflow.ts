import { proxyActivities } from '@temporalio/workflow';

import type * as chargeActivities from '../activities/charge-activities';
import type { ChargeInput, TryFinallyResult } from '../activities/charge-activities';

const { chargeAccount, releaseLock } = proxyActivities<typeof chargeActivities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Charges an account inside a `try` with a `finally` that always releases the lock, so the
 * control-flow model emits a `try` region with a `finalizer` and no handler. The `return`
 * inside the `try` also emits a nested `return` terminal. Both Activities succeed, so the
 * committed history is deterministic.
 */
export async function chargeWorkflow(input: ChargeInput): Promise<TryFinallyResult> {
  try {
    const receipt = await chargeAccount(input.accountId);

    return { accountId: input.accountId, chargeId: receipt.chargeId };
  } finally {
    await releaseLock(input.accountId);
  }
}
