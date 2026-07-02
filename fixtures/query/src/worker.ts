import { Worker } from '@temporalio/worker';

import * as activities from './activities/audit-activities';

export async function createQueryWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/query-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
