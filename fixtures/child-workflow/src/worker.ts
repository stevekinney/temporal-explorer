import { Worker } from '@temporalio/worker';

export async function createChildWorkflowWorker(taskQueue: string): Promise<Worker> {
  return Worker.create({
    taskQueue,
    workflowsPath: new URL('./workflows/child-workflow-parent.ts', import.meta.url).pathname,
  });
}
