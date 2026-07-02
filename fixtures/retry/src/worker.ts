import { Worker } from '@temporalio/worker';

import * as activities from './activities/charge-activities';

export async function createRetryWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/retry-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
