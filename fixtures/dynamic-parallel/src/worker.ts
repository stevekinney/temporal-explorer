import { Worker } from '@temporalio/worker';

import * as activities from './activities/broadcast-activities';

export async function createDynamicParallelWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/broadcast-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
