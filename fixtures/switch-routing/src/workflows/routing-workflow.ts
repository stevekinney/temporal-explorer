import { proxyActivities } from '@temporalio/workflow';

import type * as fulfillmentActivities from '../activities/fulfillment-activities';
import type {
  FulfillmentResult,
  RoutingInput,
  RoutingResult,
} from '../activities/fulfillment-activities';

const { premiumFulfillment, standardFulfillment, basicFulfillment, recordRouting } =
  proxyActivities<typeof fulfillmentActivities>({
    startToCloseTimeout: '1 minute',
  });

/**
 * Routes an order through a `switch` on its service tier, so the control-flow model
 * emits a `branch` region of kind `switch` with one clause per `case` plus the
 * `default` as the `otherwise` arm. The committed history exercises the `gold` case.
 */
export async function routingWorkflow(input: RoutingInput): Promise<RoutingResult> {
  let fulfillment: FulfillmentResult;

  switch (input.tier) {
    case 'gold':
      fulfillment = await premiumFulfillment(input.requestId);
      break;
    case 'silver':
      fulfillment = await standardFulfillment(input.requestId);
      break;
    default:
      fulfillment = await basicFulfillment(input.requestId);
  }

  await recordRouting(input.requestId, fulfillment.path);

  return { requestId: input.requestId, tier: input.tier, path: fulfillment.path };
}
