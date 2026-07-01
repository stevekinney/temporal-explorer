import { Worker } from '@temporalio/worker';

import * as activities from './activities/order-activities';

export async function createBasicOrderWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/basic-order-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
