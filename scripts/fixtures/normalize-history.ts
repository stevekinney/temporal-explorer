import { Buffer } from 'node:buffer';

import { format } from 'prettier';

export type TemporalHistoryEvent = {
  eventId?: string | number;
  eventType?: string | number;
  eventTime?: string;
  [key: string]: unknown;
};

export type TemporalHistoryJson = {
  events?: TemporalHistoryEvent[];
  [key: string]: unknown;
};

export const normalizedIdentity = 'temporal-explorer-fixture-worker';

const repositoryRoot = new URL('../../', import.meta.url);
const baseEventTime = Date.UTC(2026, 0, 1, 0, 0, 0, 0);
const uuidSubstringPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;

/** Formats a JSON value with Prettier so committed fixtures match format:check. */
export async function createStableJson(value: unknown): Promise<string> {
  return await format(JSON.stringify(value), { parser: 'json' });
}

/** Returns the SHA-256 hex digest recorded in fixture provenance files. */
export function createContentHash(text: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(text);
  return hasher.digest('hex');
}

/**
 * Maps every distinct UUID to a stable replacement, including UUIDs embedded
 * inside longer strings such as `"<uuid>/request"` message identifiers. The
 * primary run ID becomes `<history>-run-id`; later distinct UUIDs (child
 * Workflow run IDs, update request IDs, continue-as-new run IDs) become
 * `<history>-run-id-2`, `-3`, and so on in order of first appearance.
 */
export class RunIdNormalizer {
  private readonly replacements = new Map<string, string>();

  constructor(
    private readonly historyName: string,
    primaryRunId: string,
  ) {
    this.replacements.set(primaryRunId.toLowerCase(), `${historyName}-run-id`);
  }

  private replaceUuid(uuid: string): string {
    const key = uuid.toLowerCase();
    const existing = this.replacements.get(key);

    if (existing) {
      return existing;
    }

    const replacement = `${this.historyName}-run-id-${this.replacements.size + 1}`;
    this.replacements.set(key, replacement);
    return replacement;
  }

  normalize(value: string): string {
    return value.replaceAll(uuidSubstringPattern, (uuid) => this.replaceUuid(uuid));
  }
}

type LongLike = { low: number; high: number; unsigned: boolean; toString(): string };

function isLongLike(value: object): value is LongLike {
  const constructorName = (value as { constructor?: { name?: unknown } }).constructor?.name;
  return constructorName === 'Long';
}

/** Converts fetched proto history values (Long, bytes) into plain JSON values. */
export function toJsonCompatible(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }

  if (value && typeof value === 'object' && isLongLike(value)) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonCompatible);
  }

  if (value && typeof value === 'object') {
    return toJsonCompatibleObject(value);
  }

  return value;
}

function toJsonCompatibleObject(value: object): Record<string, unknown> {
  const jsonCompatible: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (childValue !== undefined && childValue !== null) {
      jsonCompatible[key] = toJsonCompatible(childValue);
    }
  }

  return jsonCompatible;
}

function normalizeStackTrace(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replaceAll(repositoryRoot.pathname, '<repository>/'))
    .join('\n');
}

function normalizeByKey(
  value: unknown,
  key: string,
): { handled: true; value: unknown } | undefined {
  if (key === 'identity') {
    return { handled: true, value: normalizedIdentity };
  }

  if (key === 'historySizeBytes') {
    return { handled: true, value: '0' };
  }

  if (key === 'stackTrace' && typeof value === 'string') {
    return { handled: true, value: normalizeStackTrace(value) };
  }

  if ((key === 'coreUsedFlags' || key === 'langUsedFlags') && Array.isArray(value)) {
    return {
      handled: true,
      value: [...value].toSorted((left, right) => Number(left) - Number(right)),
    };
  }

  return undefined;
}

function normalizeValue(value: unknown, runIds: RunIdNormalizer, key?: string): unknown {
  if (key !== undefined) {
    const byKey = normalizeByKey(value, key);
    if (byKey) {
      return byKey.value;
    }
  }

  if (typeof value === 'string') {
    return runIds.normalize(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, runIds));
  }

  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    // Proto map fields (payload metadata, indexed search attribute fields)
    // serialize with nondeterministic key order; sort them for stable output.
    const entries =
      key === 'metadata' || key === 'indexedFields'
        ? Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right))
        : Object.entries(value);

    for (const [childKey, childValue] of entries) {
      normalized[childKey] = normalizeValue(childValue, runIds, childKey);
    }

    return normalized;
  }

  return value;
}

/** Reports whether a JSON value has the top-level Event History object shape. */
export function isHistoryJson(value: unknown): value is TemporalHistoryJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalizes run IDs, identities, and event timestamps for deterministic fixtures. */
export function normalizeHistory(
  history: TemporalHistoryJson,
  runIds: RunIdNormalizer,
): TemporalHistoryJson {
  const normalized = normalizeValue(history, runIds);

  if (!isHistoryJson(normalized)) {
    throw new Error('normalizeValue did not return an object for a history input.');
  }

  const events = normalized.events ?? [];

  for (const event of events) {
    const eventId = Number(event.eventId ?? 0);
    event.eventTime = new Date(baseEventTime + eventId).toISOString();
  }

  return normalized;
}

/** Counts events per event type for fixture provenance summaries. */
export function countEventTypes(history: TemporalHistoryJson): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of history.events ?? []) {
    const eventType = String(event.eventType ?? 'EVENT_TYPE_UNSPECIFIED');
    counts[eventType] = (counts[eventType] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}
