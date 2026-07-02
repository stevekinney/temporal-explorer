import type { RuntimeOperation, RuntimeTimelineEntry } from '@temporal-explorer/schemas';

import type { HistoryEvent } from './history-json';
import { getWorkflowClosedStatus } from './workflow-lifecycle';

function createTimelineEntry(
  event: HistoryEvent,
  operationId: string,
  label: string,
): RuntimeTimelineEntry {
  return {
    id: `timeline:${event.eventId}`,
    operationId,
    at: event.eventTime,
    label,
    eventIds: [event.eventId],
  };
}

function appendActivityTimelineEntry(
  entries: RuntimeTimelineEntry[],
  operation: Extract<RuntimeOperation, { kind: 'activity' }>,
): void {
  const scheduled = operation.eventReferences[0];
  const closedReference = operation.eventReferences.at(-1);

  if (scheduled) {
    entries.push({
      id: `timeline:${scheduled.eventId}`,
      operationId: operation.id,
      at: operation.firstScheduledAt,
      label: `${operation.activityType} scheduled`,
      eventIds: [scheduled.eventId],
    });
  }

  if (closedReference && operation.closedAt) {
    entries.push({
      id: `timeline:${closedReference.eventId}`,
      operationId: operation.id,
      at: operation.closedAt,
      label: `${operation.activityType} ${operation.status}`,
      eventIds: [closedReference.eventId],
    });
  }
}

function appendSignalTimelineEntry(
  entries: RuntimeTimelineEntry[],
  operation: Extract<RuntimeOperation, { kind: 'signal' }>,
): void {
  const reference = operation.eventReferences[0];

  if (reference) {
    entries.push({
      id: `timeline:${reference.eventId}`,
      operationId: operation.id,
      at: operation.receivedAt,
      label: `Signal ${operation.signalName} received`,
      eventIds: [reference.eventId],
    });
  }
}

function appendTimerTimelineEntries(
  entries: RuntimeTimelineEntry[],
  operation: Extract<RuntimeOperation, { kind: 'timer' }>,
): void {
  const started = operation.eventReferences[0];
  const closed = operation.eventReferences.at(-1);

  if (started) {
    entries.push({
      id: `timeline:${started.eventId}`,
      operationId: operation.id,
      at: operation.startedAt,
      label: `Timer ${operation.timerId} started`,
      eventIds: [started.eventId],
    });
  }

  if (closed && closed !== started && operation.closedAt) {
    entries.push({
      id: `timeline:${closed.eventId}`,
      operationId: operation.id,
      at: operation.closedAt,
      label: `Timer ${operation.timerId} ${operation.status}`,
      eventIds: [closed.eventId],
    });
  }
}

export function createTimeline(
  started: HistoryEvent,
  closed: HistoryEvent | undefined,
  operations: RuntimeOperation[],
): RuntimeTimelineEntry[] {
  const entries = [createTimelineEntry(started, 'workflow:start', 'Workflow started')];

  for (const operation of operations) {
    if (operation.kind === 'activity') {
      appendActivityTimelineEntry(entries, operation);
    } else if (operation.kind === 'signal') {
      appendSignalTimelineEntry(entries, operation);
    } else if (operation.kind === 'timer') {
      appendTimerTimelineEntries(entries, operation);
    }
  }

  if (closed) {
    entries.push(
      createTimelineEntry(
        closed,
        `workflow:${getWorkflowClosedStatus(closed.eventType)}`,
        'Workflow closed',
      ),
    );
  }

  return entries.toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at));
}
