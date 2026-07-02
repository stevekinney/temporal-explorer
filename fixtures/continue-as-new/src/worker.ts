import { Worker } from '@temporalio/worker';

import * as activities from './activities/iteration-activities';

export async function createContinueAsNewWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/continue-as-new-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
