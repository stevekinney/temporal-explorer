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

export function createTimeline(
  started: HistoryEvent,
  closed: HistoryEvent | undefined,
  activityOperations: RuntimeOperation[],
): RuntimeTimelineEntry[] {
  const entries = [createTimelineEntry(started, 'workflow:start', 'Workflow started')];

  for (const operation of activityOperations) {
    if (operation.kind === 'activity') {
      appendActivityTimelineEntry(entries, operation);
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
