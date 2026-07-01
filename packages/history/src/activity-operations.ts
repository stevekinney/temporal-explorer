import type {
  ActivityAttempt,
  PayloadReference,
  RuntimeOperation,
} from '@temporal-explorer/schemas';

import { eventTypes } from './event-types';
import {
  readPositiveIntegerField,
  readRecordField,
  readStringField,
  type HistoryEvent,
} from './history-json';
import type { PayloadPreviewConfiguration } from './payloads';
import { collectPayloadIds, createEventReference, getDurationMs } from './references';

type MutableActivityExecution = {
  scheduled: HistoryEvent;
  activityId: string;
  activityType: string;
  payloadReferences: string[];
  started: HistoryEvent[];
  closed: { event: HistoryEvent; status: ActivityAttempt['status'] }[];
};

export function createActivityOperations(
  events: HistoryEvent[],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): RuntimeOperation[] {
  return collectActivities(events, payloads, configuration).map(createActivityOperation);
}

function collectActivities(
  events: HistoryEvent[],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): MutableActivityExecution[] {
  const activities = new Map<number, MutableActivityExecution>();

  for (const event of events) {
    recordActivityEvent(event, activities, payloads, configuration);
  }

  return [...activities.values()].toSorted(
    (left, right) => left.scheduled.eventId - right.scheduled.eventId,
  );
}

function recordActivityEvent(
  event: HistoryEvent,
  activities: Map<number, MutableActivityExecution>,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  if (event.eventType === eventTypes.activityTaskScheduled) {
    recordScheduledActivity(event, activities, payloads, configuration);
    return;
  }

  recordActivityProgress(event, activities, payloads, configuration);
}

function recordScheduledActivity(
  event: HistoryEvent,
  activities: Map<number, MutableActivityExecution>,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  const attributes = readRecordField(event.raw, 'activityTaskScheduledEventAttributes');
  const activityType = readStringField(readRecordField(attributes ?? {}, 'activityType'), 'name');
  const activityId = readStringField(attributes, 'activityId') ?? String(event.eventId);
  const input = readRecordField(attributes ?? {}, 'input');

  activities.set(event.eventId, {
    scheduled: event,
    activityId,
    activityType: activityType ?? 'unknownActivity',
    payloadReferences: collectPayloadIds(payloads, event, input, 'input', configuration),
    started: [],
    closed: [],
  });
}

function recordActivityProgress(
  event: HistoryEvent,
  activities: Map<number, MutableActivityExecution>,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  const attributes = getActivityEventAttributes(event);
  const scheduledEventId = readPositiveIntegerField(attributes, 'scheduledEventId');
  const activity = scheduledEventId ? activities.get(scheduledEventId) : undefined;

  if (!activity) {
    return;
  }

  if (event.eventType === eventTypes.activityTaskStarted) {
    activity.started.push(event);
    return;
  }

  const status = getActivityClosedStatus(event.eventType);

  if (!status) {
    return;
  }

  recordActivityClose(event, activity, attributes, status, payloads, configuration);
}

function recordActivityClose(
  event: HistoryEvent,
  activity: MutableActivityExecution,
  attributes: Record<string, unknown> | undefined,
  status: ActivityAttempt['status'],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  const result = readRecordField(attributes ?? {}, status === 'failed' ? 'failure' : 'result');
  const kind: PayloadReference['kind'] = status === 'failed' ? 'failure' : 'result';
  activity.closed.push({ event, status });
  activity.payloadReferences.push(
    ...collectPayloadIds(payloads, event, result, kind, configuration),
  );
}

function getActivityEventAttributes(event: HistoryEvent): Record<string, unknown> | undefined {
  if (event.eventType === eventTypes.activityTaskStarted) {
    return readRecordField(event.raw, 'activityTaskStartedEventAttributes');
  }

  if (event.eventType === eventTypes.activityTaskCompleted) {
    return readRecordField(event.raw, 'activityTaskCompletedEventAttributes');
  }

  if (event.eventType === eventTypes.activityTaskFailed) {
    return readRecordField(event.raw, 'activityTaskFailedEventAttributes');
  }

  if (event.eventType === eventTypes.activityTaskTimedOut) {
    return readRecordField(event.raw, 'activityTaskTimedOutEventAttributes');
  }

  if (event.eventType === eventTypes.activityTaskCanceled) {
    return readRecordField(event.raw, 'activityTaskCanceledEventAttributes');
  }

  if (event.eventType === eventTypes.activityTaskCancelRequested) {
    return readRecordField(event.raw, 'activityTaskCancelRequestedEventAttributes');
  }

  return undefined;
}

function getActivityClosedStatus(eventType: number): ActivityAttempt['status'] | undefined {
  if (eventType === eventTypes.activityTaskCompleted) {
    return 'completed';
  }

  if (eventType === eventTypes.activityTaskFailed) {
    return 'failed';
  }

  if (eventType === eventTypes.activityTaskTimedOut) {
    return 'timedOut';
  }

  if (eventType === eventTypes.activityTaskCanceled) {
    return 'canceled';
  }

  return undefined;
}

function createActivityOperation(activity: MutableActivityExecution): RuntimeOperation {
  const lastClosed = activity.closed.at(-1);
  const eventReferences = [
    activity.scheduled,
    ...activity.started,
    ...activity.closed.map((closed) => closed.event),
  ].map(createEventReference);

  return {
    id: `activity:${activity.activityType}:${activity.scheduled.eventId}`,
    kind: 'activity',
    activityType: activity.activityType,
    activityId: activity.activityId,
    status: lastClosed?.status ?? 'pending',
    attempts: createActivityAttempts(activity),
    firstScheduledAt: activity.scheduled.eventTime,
    ...(lastClosed ? { closedAt: lastClosed.event.eventTime } : {}),
    ...(lastClosed
      ? { durationMs: getDurationMs(activity.scheduled.eventTime, lastClosed.event.eventTime) }
      : {}),
    eventReferences,
    payloadReferences: activity.payloadReferences,
  };
}

function createActivityAttempts(activity: MutableActivityExecution): ActivityAttempt[] {
  if (activity.closed.length === 0) {
    return [
      {
        attempt: 1,
        scheduledEventId: activity.scheduled.eventId,
        ...(activity.started[0] ? { startedEventId: activity.started[0].eventId } : {}),
        status: 'pending',
      },
    ];
  }

  return activity.closed.map((closed, index) => ({
    attempt: index + 1,
    scheduledEventId: activity.scheduled.eventId,
    ...(activity.started[index] ? { startedEventId: activity.started[index].eventId } : {}),
    closedEventId: closed.event.eventId,
    status: closed.status,
  }));
}
