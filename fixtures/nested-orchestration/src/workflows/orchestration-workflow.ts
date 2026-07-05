import { proxyActivities } from '@temporalio/workflow';

import type * as orchestrationActivities from '../activities/orchestration-activities';
import type {
  OrchestrationInput,
  OrchestrationResult,
} from '../activities/orchestration-activities';

const { buildPlan, reserveInventory, reserveShipping, confirmStage, auditStage, compensateStage } =
  proxyActivities<typeof orchestrationActivities>({
    startToCloseTimeout: '1 minute',
    retry: { maximumAttempts: 1 },
  });

/**
 * Orchestrates a multi-stage order to stress nested control-flow rendering: a `for ... of`
 * loop contains an `if` branch whose `fulfillment` arm runs a fixed `Promise.all` and whose
 * `else` arm runs a `try / catch`. The control-flow model therefore nests a parallel region
 * and a try region several container levels deep inside the loop's branch. With serialized
 * Activity execution and the fixed stage list, the committed history is deterministic.
 */
export async function orchestrationWorkflow(
  input: OrchestrationInput,
): Promise<OrchestrationResult> {
  const plan = await buildPlan(input.orderId);
  let completedStages = 0;

  for (const stage of input.stages) {
    if (stage === 'fulfillment') {
      await Promise.all([
        reserveInventory(input.orderId, stage),
        reserveShipping(input.orderId, stage),
      ]);
      await confirmStage(input.orderId, stage);
      completedStages += 1;
    } else {
      try {
        await auditStage(input.orderId, stage);
      } catch {
        await compensateStage(input.orderId, stage);
      }
      completedStages += 1;
    }
  }

  return { orderId: input.orderId, planId: plan.planId, completedStages };
}
