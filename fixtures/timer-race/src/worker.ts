import { Worker } from '@temporalio/worker';

import * as activities from './activities/race-activities';

export async function createTimerRaceWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/timer-race-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
