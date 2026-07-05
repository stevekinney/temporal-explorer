import { Worker } from '@temporalio/worker';

import * as activities from './activities/booking-activities';

export async function createTryCatchFinallyWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/booking-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
