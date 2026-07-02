import { Worker } from '@temporalio/worker';

import * as activities from './activities/profile-activities';

export async function createPayloadWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/payload-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
