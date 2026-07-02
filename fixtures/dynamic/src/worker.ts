import { Worker } from '@temporalio/worker';

import * as activities from './activities/step-activities';

export async function createDynamicWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/dynamic-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
