import { Worker } from '@temporalio/worker';

export async function createExternalWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/external-interaction-workflow.ts', import.meta.url)
      .pathname,
  });
}
