import { Worker } from '@temporalio/worker';

import * as activities from './activities/approval-activities';

export async function createBranchChainWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/review-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
