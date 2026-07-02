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

  if (isAlwaysObservedOperation(operation)) {
    return 'observed';
  }

  if (operation.kind === 'workflow-lifecycle') {
    return workflowLifecycleState(operation.status);
  }

  if (operation.kind === 'timer') {
    return timerOperationState(operation.status);
  }

  if (operation.kind === 'update') {
    return updateOperationState(operation.status);
  }

  if (operation.kind === 'child-workflow') {
    return childWorkflowOperationState(operation.status);
  }

  if (operation.kind === 'external-signal') {
    return externalSignalOperationState(operation.status);
  }

  return activityOperationState(operation);
}

/**
 * Signal deliveries, patch markers, continue-as-new transitions, and cancellation
 * requests are all one-shot facts recorded in history rather than actions with a
 * pass/fail outcome, so they always render as `observed`.
 */
function isAlwaysObservedOperation(
  operation: RuntimeOperation,
): operation is Extract<
  RuntimeOperation,
  { kind: 'signal' | 'marker' | 'continue-as-new' | 'cancel-request' }
> {
  return (
    operation.kind === 'signal' ||
    operation.kind === 'marker' ||
    operation.kind === 'continue-as-new' ||
    operation.kind === 'cancel-request'
  );
}

/**
 * A terminal or in-flight status is always more informative than the fact that an
 * Activity was retried along the way, so those statuses take priority — mirroring
 * `commandStatePriority` below. `retried` is reported only once the Activity finally
 * completed after more than one attempt.
 */
function activityOperationState(
  operation: Extract<RuntimeOperation, { kind: 'activity' }>,
): RuntimeOverlayState {
  if (operation.status === 'failed') return 'failed';
  if (operation.status === 'timedOut') return 'timed out';
  if (operation.status === 'canceled') return 'canceled';
  if (operation.status === 'pending') return 'pending';
  if (isRetriedActivity(operation)) return 'retried';

  return 'completed';
}

/**
 * An Activity was retried if its history contains more than one attempt record, or
 * if the most recent attempt's own `attempt` counter is greater than 1 — fixtures
 * may compact a multi-attempt history into a single attempt record that reports the
 * final attempt number rather than one record per attempt.
 */
function isRetriedActivity(operation: Extract<RuntimeOperation, { kind: 'activity' }>): boolean {
  const lastAttemptNumber = operation.attempts.at(-1)?.attempt ?? 1;

  return operation.attempts.length > 1 || lastAttemptNumber > 1;
}

function updateOperationState(
  status: Extract<RuntimeOperation, { kind: 'update' }>['status'],
): RuntimeOverlayState {
  if (status === 'failed') return 'failed';
  if (status === 'completed') return 'completed';

  return 'pending';
}

function childWorkflowOperationState(
  status: Extract<RuntimeOperation, { kind: 'child-workflow' }>['status'],
): RuntimeOverlayState {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'startFailed') return 'failed';
  if (status === 'canceled' || status === 'terminated') return 'canceled';
  if (status === 'timedOut') return 'timed out';

  return 'pending';
}

function externalSignalOperationState(
  status: Extract<RuntimeOperation, { kind: 'external-signal' }>['status'],
): RuntimeOverlayState {
  if (status === 'signaled') return 'completed';
  if (status === 'failed') return 'failed';

  return 'pending';
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
  if (trace.execution.status === 'continued-as-new') return 'observed';

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
  if (status === 'timedOut') return 'timed out';
  if (status === 'continued-as-new') return 'observed';

  return 'canceled'; // canceled | terminated
}

function timerOperationState(
  status: Extract<RuntimeOperation, { kind: 'timer' }>['status'],
): RuntimeOverlayState {
  if (status === 'fired') return 'fired';
  if (status === 'canceled') return 'canceled';

  return 'pending';
}
