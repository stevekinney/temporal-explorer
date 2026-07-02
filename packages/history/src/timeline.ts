import type {
  EventReference,
  RuntimeOperation,
  RuntimeTimelineEntry,
} from '@temporal-explorer/schemas';

import type { HistoryEvent } from './history-json';
import { getWorkflowClosedStatus } from './workflow-lifecycle';

type TimelineSpan = {
  at: string;
  label: string;
  reference: EventReference | undefined;
};

function openCloseSpans(
  operation: RuntimeOperation,
  openAt: string,
  openLabel: string,
  closedAt: string | undefined,
  closedLabel: string,
): TimelineSpan[] {
  const opened = operation.eventReferences[0];
  const closed = operation.eventReferences.at(-1);
  const spans: TimelineSpan[] = [{ at: openAt, label: openLabel, reference: opened }];

  if (closedAt && closed && closed !== opened) {
    spans.push({ at: closedAt, label: closedLabel, reference: closed });
  }

  return spans;
}

function activitySpans(operation: Extract<RuntimeOperation, { kind: 'activity' }>): TimelineSpan[] {
  return openCloseSpans(
    operation,
    operation.firstScheduledAt,
    `${operation.activityType} scheduled`,
    operation.closedAt,
    `${operation.activityType} ${operation.status}`,
  );
}

function pointSpan(operation: RuntimeOperation, at: string, label: string): TimelineSpan[] {
  return [{ at, label, reference: operation.eventReferences[0] }];
}

function markerLabel(operation: Extract<RuntimeOperation, { kind: 'marker' }>): string {
  if (!operation.patchId) {
    return `Marker ${operation.markerName}`;
  }

  return `Patch ${operation.patchId}${operation.deprecated ? ' (deprecated)' : ''}`;
}

function pointOperationSpans(operation: RuntimeOperation): TimelineSpan[] {
  switch (operation.kind) {
    case 'signal':
      return pointSpan(operation, operation.receivedAt, `Signal ${operation.signalName} received`);
    case 'marker':
      return pointSpan(operation, operation.recordedAt, markerLabel(operation));
    case 'continue-as-new':
      return pointSpan(operation, operation.occurredAt, 'Continued as new');
    case 'cancel-request':
      return pointSpan(operation, operation.requestedAt, 'Cancellation requested');
    default:
      return [];
  }
}

function operationSpans(operation: RuntimeOperation): TimelineSpan[] {
  switch (operation.kind) {
    case 'activity':
      return activitySpans(operation);
    case 'timer':
      return openCloseSpans(
        operation,
        operation.startedAt,
        `Timer ${operation.timerId} started`,
        operation.closedAt,
        `Timer ${operation.timerId} ${operation.status}`,
      );
    case 'update':
      return openCloseSpans(
        operation,
        operation.acceptedAt,
        `Update ${operation.updateName} accepted`,
        operation.closedAt,
        `Update ${operation.updateName} ${operation.status}`,
      );
    case 'child-workflow':
      return openCloseSpans(
        operation,
        operation.initiatedAt,
        `Child ${operation.workflowType} initiated`,
        operation.closedAt,
        `Child ${operation.workflowType} ${operation.status}`,
      );
    case 'external-signal':
      return openCloseSpans(
        operation,
        operation.initiatedAt,
        `External signal ${operation.signalName} initiated`,
        operation.closedAt,
        `External signal ${operation.signalName} ${operation.status}`,
      );
    default:
      return pointOperationSpans(operation);
  }
}

/** Builds the semantic timeline for a trace from its collapsed operations. */
export function createTimeline(
  started: HistoryEvent,
  closed: HistoryEvent | undefined,
  operations: RuntimeOperation[],
): RuntimeTimelineEntry[] {
  const entries: RuntimeTimelineEntry[] = [
    {
      id: `timeline:${started.eventId}`,
      operationId: 'workflow:start',
      at: started.eventTime,
      label: 'Workflow started',
      eventIds: [started.eventId],
    },
  ];

  for (const operation of operations) {
    for (const span of operationSpans(operation)) {
      if (span.reference) {
        entries.push({
          id: `timeline:${span.reference.eventId}`,
          operationId: operation.id,
          at: span.at,
          label: span.label,
          eventIds: [span.reference.eventId],
        });
      }
    }
  }

  if (closed) {
    entries.push({
      id: `timeline:${closed.eventId}`,
      operationId: `workflow:${getWorkflowClosedStatus(closed.eventType)}`,
      at: closed.eventTime,
      label: 'Workflow closed',
      eventIds: [closed.eventId],
    });
  }

  return entries.toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at));
}
