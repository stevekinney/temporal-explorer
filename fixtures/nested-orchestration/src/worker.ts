import { Worker } from '@temporalio/worker';

import * as activities from './activities/orchestration-activities';

export async function createNestedOrchestrationWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/orchestration-workflow.ts', import.meta.url).pathname,
    activities,
  });
}
