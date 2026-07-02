import { Worker } from '@temporalio/worker';

import * as activities from './activities/large-activities';

export async function createLargeWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/large-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
