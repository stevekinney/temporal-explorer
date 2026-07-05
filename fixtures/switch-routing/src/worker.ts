import { Worker } from '@temporalio/worker';

import * as activities from './activities/fulfillment-activities';

export async function createSwitchRoutingWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/routing-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
