import { Worker } from '@temporalio/worker';

import * as activities from './activities/reservation-activities';

export async function createParallelWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/parallel-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
