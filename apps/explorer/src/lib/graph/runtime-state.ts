import type {
  ExecutionOverlayDocument,
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

export const runtimeOverlayStates = [
  'observed',
  'completed',
  'fired',
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

  if (operation.kind === 'signal') {
    return 'observed';
  }

  if (operation.kind === 'timer') {
    return timerOperationState(operation.status);
  }

  if (operation.attempts.length > 1) {
    return 'retried';
  }

  return operation.status === 'timedOut' ? 'timed out' : operation.status;
}

/**
 * Resolves the runtime overlay state for a static graph node (an Activity, Timer,
 * Condition, or Signal command) by combining its overlay `observed` flag with the
 * states of any Runtime Operations mapped to it. `fallbackObservedState` is returned
 * when the node is observed but no mapped Operation reports a more specific state —
 * for example a Signal that was received but has no exceptional status of its own.
 */
export function commandState(
  node: { id: string },
  overlay: ExecutionOverlayDocument | undefined,
  operations: RuntimeOperation[],
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>,
  fallbackObservedState: RuntimeOverlayState = 'completed',
): RuntimeOverlayState {
  const overlayNode = overlay?.staticNodes.find((candidate) => candidate.id === node.id);

  if (overlayNode && !overlayNode.observed) {
    return 'not taken';
  }

  const mappedStates = operations
    .filter((operation) => mappingsByRuntimeOperationId.get(operation.id)?.staticNodeId === node.id)
    .map(operationState);
  const priorityState = commandStatePriority.find((state) => mappedStates.includes(state));

  if (priorityState) {
    return priorityState;
  }

  if (mappedStates.length > 0) {
    return mappedStates[0] ?? fallbackObservedState;
  }

  return overlayNode?.observed ? fallbackObservedState : 'not taken';
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

function timerOperationState(
  status: Extract<RuntimeOperation, { kind: 'timer' }>['status'],
): RuntimeOverlayState {
  if (status === 'fired') return 'fired';
  if (status === 'canceled') return 'canceled';

  return 'pending';
}
