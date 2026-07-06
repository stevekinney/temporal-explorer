import { Worker } from '@temporalio/worker';

import * as activities from './activities/region-activities';

export async function createPromiseAnyWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/region-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
