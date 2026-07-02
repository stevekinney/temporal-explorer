import { Worker } from '@temporalio/worker';

import * as activities from './activities/address-activities';

export async function createUpdateWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/update-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
