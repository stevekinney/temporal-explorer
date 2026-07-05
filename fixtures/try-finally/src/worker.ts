import { Worker } from '@temporalio/worker';

import * as activities from './activities/charge-activities';

export async function createTryFinallyWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/charge-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
