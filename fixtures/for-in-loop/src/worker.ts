import { Worker } from '@temporalio/worker';

import * as activities from './activities/flag-activities';

export async function createForInLoopWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/flag-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
