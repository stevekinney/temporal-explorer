import type { RuntimeOperation } from '@temporal-explorer/schemas';

import { eventTypes } from './event-types';
import {
  readPositiveIntegerField,
  readRecordField,
  readStringField,
  type HistoryEvent,
} from './history-json';

type MutableTimer = {
  started: HistoryEvent;
  timerId: string;
  durationText?: string;
  closed?: { event: HistoryEvent; status: 'fired' | 'canceled' };
};

function readDurationText(attributes: Record<string, unknown> | undefined): string | undefined {
  const timeout = readRecordField(attributes ?? {}, 'startToFireTimeout');

  if (!timeout) {
    return undefined;
  }

  const seconds = timeout['seconds'];

  if (typeof seconds === 'string' || typeof seconds === 'number') {
    return `${seconds}s`;
  }

  return undefined;
}

function recordTimerClose(
  event: HistoryEvent,
  timers: Map<number, MutableTimer>,
  attributesField: string,
  status: 'fired' | 'canceled',
): void {
  const attributes = readRecordField(event.raw, attributesField);
  const startedEventId = readPositiveIntegerField(attributes, 'startedEventId');
  const timer = startedEventId ? timers.get(startedEventId) : undefined;

  if (timer) {
    timer.closed = { event, status };
  }
}

/** Collapses TimerStarted/TimerFired/TimerCanceled events into timer operations. */
export function createTimerOperations(events: HistoryEvent[]): RuntimeOperation[] {
  const timers = new Map<number, MutableTimer>();

  for (const event of events) {
    if (event.eventType === eventTypes.timerStarted) {
      const attributes = readRecordField(event.raw, 'timerStartedEventAttributes');
      const durationText = readDurationText(attributes);

      timers.set(event.eventId, {
        started: event,
        timerId: readStringField(attributes, 'timerId') ?? String(event.eventId),
        ...(durationText ? { durationText } : {}),
      });
      continue;
    }

    if (event.eventType === eventTypes.timerFired) {
      recordTimerClose(event, timers, 'timerFiredEventAttributes', 'fired');
      continue;
    }

    if (event.eventType === eventTypes.timerCanceled) {
      recordTimerClose(event, timers, 'timerCanceledEventAttributes', 'canceled');
    }
  }

  return [...timers.values()]
    .toSorted((left, right) => left.started.eventId - right.started.eventId)
    .map((timer) => ({
      id: `timer:${timer.timerId}:${timer.started.eventId}`,
      kind: 'timer' as const,
      timerId: timer.timerId,
      status: timer.closed?.status ?? ('pending' as const),
      startedAt: timer.started.eventTime,
      ...(timer.closed ? { closedAt: timer.closed.event.eventTime } : {}),
      ...(timer.durationText ? { durationText: timer.durationText } : {}),
      eventReferences: [
        { eventId: timer.started.eventId, eventType: timer.started.eventTypeName },
        ...(timer.closed
          ? [{ eventId: timer.closed.event.eventId, eventType: timer.closed.event.eventTypeName }]
          : []),
      ],
    }));
}
