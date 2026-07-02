import type { RuntimeOperation } from '@temporal-explorer/schemas';

import type { RuntimeOverlayState } from './runtime-state';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const badgeVariantsByState = {
  observed: 'success',
  completed: 'success',
  fired: 'success',
  failed: 'danger',
  retried: 'warning',
  'timed out': 'danger',
  canceled: 'danger',
  pending: 'warning',
  skipped: 'neutral',
  'not taken': 'neutral',
  unmapped: 'accent',
  ambiguous: 'warning',
} satisfies Record<RuntimeOverlayState, BadgeVariant>;

export function statusBadgeVariant(state: RuntimeOverlayState | undefined): BadgeVariant {
  return state ? badgeVariantsByState[state] : 'info';
}

export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(11, 23);
}

export function formatDuration(durationMs: number | undefined): string {
  return durationMs === undefined ? 'pending' : `${durationMs} ms`;
}

export function compactEventSummary(eventReferences: { eventId: number }[]): string {
  if (eventReferences.length === 0) {
    return '';
  }

  return `events ${eventReferences.map((reference) => `#${reference.eventId}`).join(', ')}`;
}

export function operationDisplayName(operation: RuntimeOperation): string {
  if (operation.kind === 'activity') {
    return operation.activityType;
  }

  if (operation.kind === 'workflow-lifecycle') {
    return `Workflow ${operation.status}`;
  }

  if (operation.kind === 'signal') {
    return `Signal ${operation.signalName}`;
  }

  if (operation.kind === 'timer') {
    return `Timer ${operation.timerId}`;
  }

  return extendedOperationDisplayName(operation) ?? 'Unmapped operation';
}

function extendedOperationDisplayName(
  operation: Exclude<
    RuntimeOperation,
    { kind: 'activity' | 'workflow-lifecycle' | 'signal' | 'timer' }
  >,
): string | undefined {
  if (operation.kind === 'update') return `Update ${operation.updateName}`;
  if (operation.kind === 'child-workflow') return `Child workflow ${operation.workflowType}`;
  if (operation.kind === 'external-signal') return `External signal ${operation.signalName}`;
  if (operation.kind === 'marker') return `Patch ${operation.patchId ?? operation.markerName}`;
  if (operation.kind === 'continue-as-new') return 'Continue as new';
  if (operation.kind === 'cancel-request') return 'Cancellation requested';

  return undefined; // unmapped
}

/** Every Runtime Operation kind other than `workflow-lifecycle` already reads well as
 * its own display label (`activity`, `signal`, `update`, `marker`, ...). */
export function operationKindLabel(operation: RuntimeOperation): string {
  return operation.kind === 'workflow-lifecycle' ? 'workflow' : operation.kind;
}

export function timerDurationText(operation: Extract<RuntimeOperation, { kind: 'timer' }>): string {
  return operation.durationText ?? 'pending';
}
