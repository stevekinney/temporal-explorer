import { Worker } from '@temporalio/worker';

import * as activities from './activities/batch-activities';

export async function createCountingLoopWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/batch-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
