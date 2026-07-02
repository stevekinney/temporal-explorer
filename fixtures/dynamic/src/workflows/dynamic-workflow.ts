import { proxyActivities } from '@temporalio/workflow';

import type * as stepActivities from '../activities/step-activities';
import type { DynamicInput, DynamicResult } from '../activities/step-activities';

type StepActivity = (requestId: string) => Promise<string>;

const activities = proxyActivities<typeof stepActivities>({
  startToCloseTimeout: '1 minute',
});

export async function dynamicWorkflow(input: DynamicInput): Promise<DynamicResult> {
  const stepResults: string[] = [];
  const archive = await activities.archiveRequest(input.requestId);

  for (const step of input.plan) {
    const dynamicActivities = activities as unknown as Record<string, StepActivity>;
    stepResults.push(await dynamicActivities[step](input.requestId));
  }

  stepResults.push(archive);

  return {
    requestId: input.requestId,
    stepResults,
  };
}
