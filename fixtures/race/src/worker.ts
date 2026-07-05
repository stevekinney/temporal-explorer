import { Worker } from '@temporalio/worker';

import * as activities from './activities/market-activities';

export async function createRaceWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/race-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
