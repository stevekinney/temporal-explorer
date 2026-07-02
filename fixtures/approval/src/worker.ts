import { Worker } from '@temporalio/worker';

import * as activities from './activities/approval-activities';

export async function createApprovalWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/approval-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
