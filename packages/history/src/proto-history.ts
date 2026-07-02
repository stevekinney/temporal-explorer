import { Buffer } from 'node:buffer';

import { isRecord } from './history-json';

type LongLike = { low: number; high: number; unsigned: boolean; toString(): string };

function isLongLike(value: object): value is LongLike {
  const constructorName = (value as { constructor?: { name?: unknown } }).constructor?.name;
  return constructorName === 'Long';
}

function isProtoTimestamp(value: Record<string, unknown>): boolean {
  return 'seconds' in value && !('metadata' in value) && Object.keys(value).length <= 2;
}

function toNumeric(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  if (value && typeof value === 'object' && isLongLike(value)) {
    return Number(value.toString());
  }

  return 0;
}

function toIsoTime(value: Record<string, unknown>): string {
  const seconds = toNumeric(value['seconds']);
  const nanos = toNumeric(value['nanos']);
  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
}

function convertRecord(value: Record<string, unknown>, key?: string): unknown {
  if (key === 'eventTime' && isProtoTimestamp(value)) {
    return toIsoTime(value);
  }

  const converted: Record<string, unknown> = {};

  for (const [childKey, childValue] of Object.entries(value)) {
    if (childValue !== undefined && childValue !== null) {
      converted[childKey] = convertValue(childValue, childKey);
    }
  }

  return converted;
}

function convertValue(value: unknown, key?: string): unknown {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }

  if (value && typeof value === 'object' && isLongLike(value)) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertValue(item));
  }

  if (isRecord(value)) {
    return convertRecord(value, key);
  }

  return value;
}

/**
 * Converts a fetched proto History object (Long counters, byte payloads,
 * Timestamp event times) into the plain JSON shape the trace parser reads.
 */
export function convertProtoHistory(history: unknown): unknown {
  return convertValue(history);
}
