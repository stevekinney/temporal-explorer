import { Worker } from '@temporalio/worker';

import * as activities from './activities/resource-activities';

export async function createCancellationWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/cancellation-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
