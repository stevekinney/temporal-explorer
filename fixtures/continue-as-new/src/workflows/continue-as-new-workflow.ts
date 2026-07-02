import { continueAsNew, proxyActivities } from '@temporalio/workflow';

import type * as iterationActivities from '../activities/iteration-activities';
import type { IterationInput } from '../activities/iteration-activities';

const activities = proxyActivities<typeof iterationActivities>({
  startToCloseTimeout: '1 minute',
});

export async function continueAsNewWorkflow(input: IterationInput): Promise<string> {
  await activities.recordIteration(input.iteration);

  if (input.iteration + 1 < input.maxIterations) {
    await continueAsNew<typeof continueAsNewWorkflow>({
      iteration: input.iteration + 1,
      maxIterations: input.maxIterations,
    });
  }

  return `completed-after-${input.iteration + 1}`;
}
