import { formatDuration, formatTimestamp } from '$lib/graph/runtime-display';

import type { RuntimeOperation } from '@temporal-explorer/schemas';
import type { SelectionFact } from './workflow-selection';

type RuntimeFactBuilder = (operation: RuntimeOperation) => SelectionFact[];

const runtimeFactBuilders: Partial<Record<RuntimeOperation['kind'], RuntimeFactBuilder>> = {
  activity: (operation) => (operation.kind === 'activity' ? activityFacts(operation) : []),
  timer: (operation) =>
    operation.kind === 'timer'
      ? [
          { label: 'Status', value: operation.status, tone: statusTone(operation.status) },
          { label: 'Duration', value: operation.durationText ?? 'pending' },
          { label: 'Started', value: formatTimestamp(operation.startedAt) },
        ]
      : [],
  signal: (operation) =>
    operation.kind === 'signal'
      ? [{ label: 'Received', value: formatTimestamp(operation.receivedAt) }]
      : [],
  marker: (operation) => (operation.kind === 'marker' ? markerFacts(operation) : []),
  'continue-as-new': (operation) =>
    operation.kind === 'continue-as-new'
      ? [
          ...(operation.newRunId ? [{ label: 'New run ID', value: operation.newRunId }] : []),
          { label: 'Occurred', value: formatTimestamp(operation.occurredAt) },
        ]
      : [],
  'cancel-request': (operation) =>
    operation.kind === 'cancel-request'
      ? [{ label: 'Requested', value: formatTimestamp(operation.requestedAt) }]
      : [],
  unmapped: (operation) =>
    operation.kind === 'unmapped'
      ? [{ label: 'Reason', value: operation.reason, tone: 'warning' }]
      : [],
};

export function runtimeFacts(operation: RuntimeOperation | undefined): SelectionFact[] {
  if (!operation) return [];
  return runtimeFactBuilders[operation.kind]?.(operation) ?? statusFacts(operation);
}

function activityFacts(
  operation: Extract<RuntimeOperation, { kind: 'activity' }>,
): SelectionFact[] {
  return [
    { label: 'Status', value: operation.status, tone: statusTone(operation.status) },
    {
      label: 'Attempt',
      value: String(operation.attempts.at(-1)?.attempt ?? operation.attempts.length),
    },
    { label: 'Duration', value: formatDuration(operation.durationMs) },
    { label: 'Scheduled', value: formatTimestamp(operation.firstScheduledAt) },
  ];
}

function markerFacts(operation: Extract<RuntimeOperation, { kind: 'marker' }>): SelectionFact[] {
  return [
    { label: 'Marker', value: operation.markerName },
    ...(operation.patchId ? [{ label: 'Patch ID', value: operation.patchId }] : []),
    ...(operation.deprecated !== undefined
      ? [{ label: 'Deprecated', value: operation.deprecated ? 'yes' : 'no' }]
      : []),
    { label: 'Recorded', value: formatTimestamp(operation.recordedAt) },
  ];
}

function statusFacts(operation: RuntimeOperation): SelectionFact[] {
  return 'status' in operation
    ? [{ label: 'Status', value: operation.status, tone: statusTone(operation.status) }]
    : [];
}

function statusTone(status: string): SelectionFact['tone'] {
  if (status === 'completed' || status === 'fired' || status === 'signaled') return 'success';
  if (status === 'failed' || status === 'timedOut' || status === 'canceled') return 'danger';
  if (status === 'pending' || status === 'initiated') return 'warning';
  return 'neutral';
}
