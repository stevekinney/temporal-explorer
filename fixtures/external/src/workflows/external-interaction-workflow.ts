import {
  condition,
  defineSignal,
  getExternalWorkflowHandle,
  setHandler,
} from '@temporalio/workflow';

export type ExternalInteractionInput = {
  requestId: string;
};

export type ExternalInteractionResult = {
  requestId: string;
  signaledWorkflowId: string;
};

export const targetReadySignal = defineSignal<[string]>('targetReady');
export const releaseSignal = defineSignal('release');

export async function externalSignalTarget(): Promise<string> {
  let released = false;

  setHandler(releaseSignal, () => {
    released = true;
  });

  await condition(() => released);
  return 'released';
}

export async function externalWorkflowInteraction(
  input: ExternalInteractionInput,
): Promise<ExternalInteractionResult> {
  let targetWorkflowId: string | undefined;

  setHandler(targetReadySignal, (workflowId) => {
    targetWorkflowId = workflowId;
  });

  await condition(() => targetWorkflowId !== undefined);

  const target = getExternalWorkflowHandle(targetWorkflowId ?? 'unknown');
  await target.signal(releaseSignal);

  return {
    requestId: input.requestId,
    signaledWorkflowId: targetWorkflowId ?? 'unknown',
  };
}
