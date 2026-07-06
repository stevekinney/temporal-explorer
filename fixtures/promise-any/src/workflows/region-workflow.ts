import { proxyActivities } from '@temporalio/workflow';

import type * as regionActivities from '../activities/region-activities';
import type { AnyResult, RegionInput } from '../activities/region-activities';

const { queryPrimaryRegion, queryFallbackRegion } = proxyActivities<typeof regionActivities>({
  startToCloseTimeout: '1 minute',
  retry: { maximumAttempts: 1 },
});

/**
 * Queries two redundant regions with `Promise.any`, taking the first to fulfill. The
 * control-flow model emits a fixed `parallel` region of kind `any` with two branches.
 * The primary branch fails fast (not retried) and the fallback succeeds; with serialized
 * Activity execution the primary settles before the fallback runs, so both branches are
 * settled before the Workflow returns and `any` deterministically resolves the fallback.
 */
export async function regionWorkflow(input: RegionInput): Promise<AnyResult> {
  const winner = await Promise.any([queryPrimaryRegion(input.key), queryFallbackRegion(input.key)]);

  return { requestId: input.requestId, region: winner.region, value: winner.value };
}
