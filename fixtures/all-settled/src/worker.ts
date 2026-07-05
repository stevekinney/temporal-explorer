import { Worker } from '@temporalio/worker';

import * as activities from './activities/screening-activities';

export async function createAllSettledWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/screening-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
