import type { RuntimeOperation } from '@temporal-explorer/schemas';

import type { RuntimeOverlayState } from './runtime-state';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const badgeVariantsByState = {
  observed: 'success',
  completed: 'success',
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

  return 'Unmapped operation';
}

export function operationKindLabel(operation: RuntimeOperation): string {
  if (operation.kind === 'workflow-lifecycle') return 'workflow';
  if (operation.kind === 'activity') return 'activity';

  return 'unmapped';
}
