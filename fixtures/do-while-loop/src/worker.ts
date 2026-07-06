import { Worker } from '@temporalio/worker';

import * as activities from './activities/poll-activities';

export async function createDoWhileLoopWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/poll-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
