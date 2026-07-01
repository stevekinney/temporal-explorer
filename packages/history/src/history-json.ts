import { getEventTypeName } from './event-types';

export type HistoryEvent = {
  eventId: number;
  eventType: number;
  eventTypeName: string;
  eventTime: string;
  raw: Record<string, unknown>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readRecordField(
  value: Record<string, unknown>,
  field: string,
): Record<string, unknown> | undefined {
  const candidate = value[field];
  return isRecord(candidate) ? candidate : undefined;
}

export function readArrayField(value: Record<string, unknown>, field: string): unknown[] {
  const candidate = value[field];
  return Array.isArray(candidate) ? candidate : [];
}

export function readStringField(
  value: Record<string, unknown> | undefined,
  field: string,
): string | undefined {
  const candidate = value?.[field];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

export function readPositiveIntegerField(
  value: Record<string, unknown> | undefined,
  field: string,
): number | undefined {
  const candidate = value?.[field];

  if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
    return candidate;
  }

  if (typeof candidate === 'string' && /^[1-9]\d*$/.test(candidate)) {
    return Number(candidate);
  }

  return undefined;
}

function readHistoryEvent(value: unknown, index: number): HistoryEvent {
  if (!isRecord(value)) {
    throw new Error(`History event at index ${index} is not an object.`);
  }

  const eventId = readPositiveIntegerField(value, 'eventId');
  const eventType = readPositiveIntegerField(value, 'eventType');
  const eventTime = readStringField(value, 'eventTime');

  if (!eventId) {
    throw new Error(`History event at index ${index} is missing a positive eventId.`);
  }

  if (!eventType) {
    throw new Error(`History event ${eventId} is missing a positive eventType.`);
  }

  if (!eventTime) {
    throw new Error(`History event ${eventId} is missing eventTime.`);
  }

  return {
    eventId,
    eventType,
    eventTypeName: getEventTypeName(eventType),
    eventTime,
    raw: value,
  };
}

export function parseEventHistoryEvents(history: unknown): HistoryEvent[] {
  const events = Array.isArray(history)
    ? history
    : isRecord(history)
      ? readArrayField(history, 'events')
      : [];

  if (events.length === 0) {
    throw new Error('Event History must contain at least one event.');
  }

  return events
    .map((event, index) => readHistoryEvent(event, index))
    .toSorted((left, right) => left.eventId - right.eventId);
}
