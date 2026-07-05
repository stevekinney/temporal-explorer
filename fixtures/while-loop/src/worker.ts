import { Worker } from '@temporalio/worker';

import * as activities from './activities/drain-activities';

export async function createWhileLoopWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/drain-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
