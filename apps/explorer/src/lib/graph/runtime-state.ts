import type {
  ExecutionOverlayDocument,
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTraceDocument,
  TemporalCommand,
} from '@temporal-explorer/schemas';

export const runtimeOverlayStates = [
  'observed',
  'completed',
  'failed',
  'retried',
  'timed out',
  'canceled',
  'pending',
  'skipped',
  'not taken',
  'unmapped',
  'ambiguous',
] as const;

export type RuntimeOverlayState = (typeof runtimeOverlayStates)[number];

const commandStatePriority: RuntimeOverlayState[] = [
  'failed',
  'timed out',
  'canceled',
  'pending',
  'retried',
];

export function runtimeStateToken(state: RuntimeOverlayState): string {
  return state.replaceAll(' ', '-');
}

export function operationState(operation: RuntimeOperation | undefined): RuntimeOverlayState {
  if (!operation) {
    return 'not taken';
  }

  if (operation.kind === 'unmapped') {
    return 'unmapped';
  }

  if (operation.kind === 'workflow-lifecycle') {
    return workflowLifecycleState(operation.status);
  }

  if (operation.attempts.length > 1) {
    return 'retried';
  }

  return operation.status === 'timedOut' ? 'timed out' : operation.status;
}

export function commandState(
  command: TemporalCommand,
  overlay: ExecutionOverlayDocument | undefined,
  operations: RuntimeOperation[],
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>,
): RuntimeOverlayState {
  const overlayNode = overlay?.staticNodes.find((node) => node.id === command.id);

  if (overlayNode && !overlayNode.observed) {
    return 'not taken';
  }

  const mappedStates = operations
    .filter(
      (operation) => mappingsByRuntimeOperationId.get(operation.id)?.staticNodeId === command.id,
    )
    .map(operationState);
  const priorityState = commandStatePriority.find((state) => mappedStates.includes(state));

  return (
    priorityState ?? (mappedStates.length > 0 || overlayNode?.observed ? 'completed' : 'not taken')
  );
}

export function workflowState(trace: RuntimeTraceDocument | undefined): RuntimeOverlayState {
  if (!trace) {
    return 'not taken';
  }

  if (trace.execution.status === 'timedOut') return 'timed out';
  if (trace.execution.status === 'running') return 'pending';
  if (trace.execution.status === 'terminated') return 'canceled';

  return trace.execution.status;
}

export function runtimeOperationRowState(
  mapping: RuntimeNodeMapping | undefined,
  operation: RuntimeOperation,
): RuntimeOverlayState {
  if (mapping && !mapping.staticNodeId) {
    return 'unmapped';
  }

  return mapping?.confidence === 'ambiguous' ? 'ambiguous' : operationState(operation);
}

function workflowLifecycleState(
  status: Extract<RuntimeOperation, { kind: 'workflow-lifecycle' }>['status'],
): RuntimeOverlayState {
  if (status === 'started') return 'observed';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';

  return 'canceled';
}
