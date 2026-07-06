import { proxyActivities } from '@temporalio/workflow';

import type * as screeningActivities from '../activities/screening-activities';
import type { ScreeningInput, ScreeningResult } from '../activities/screening-activities';

const { checkInventory, checkPricing, checkCompliance } = proxyActivities<
  typeof screeningActivities
>({
  startToCloseTimeout: '1 minute',
});

/**
 * Runs three independent screening Activities with `Promise.allSettled`, so the
 * control-flow model emits a fixed `parallel` region of kind `allSettled` with one
 * branch per array element. Every branch succeeds and allSettled awaits them all, so
 * the committed history is deterministic (serialized Activity execution fixes order).
 */
export async function screeningWorkflow(input: ScreeningInput): Promise<ScreeningResult> {
  const results = await Promise.allSettled([
    checkInventory(input.sku),
    checkPricing(input.sku),
    checkCompliance(input.sku),
  ]);

  const passed = results.filter(
    (result) => result.status === 'fulfilled' && result.value.passed,
  ).length;

  return { requestId: input.requestId, sku: input.sku, passed };
}
