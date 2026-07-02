import type { RuntimeOperation } from '@temporal-explorer/schemas';

import { eventTypes } from './event-types';
import {
  isRecord,
  readArrayField,
  readRecordField,
  readStringField,
  type HistoryEvent,
} from './history-json';
import { createEventReference } from './references';

type PatchDetails = {
  patchId: string;
  deprecated: boolean;
};

/**
 * Decodes the `core_patch` marker detail payload. Patch markers carry SDK
 * metadata (`{"id":"...","deprecated":bool}`), not user data, so decoding them
 * does not violate the payload privacy defaults.
 */
function readPatchDetails(
  attributes: Record<string, unknown> | undefined,
): PatchDetails | undefined {
  const details = readRecordField(attributes ?? {}, 'details');
  const patchData = readRecordField(details ?? {}, 'patch-data');
  const [payload] = readArrayField(patchData ?? {}, 'payloads');

  if (!isRecord(payload)) {
    return undefined;
  }

  const data = readStringField(payload, 'data');

  if (!data) {
    return undefined;
  }

  try {
    const decoded: unknown = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));

    if (isRecord(decoded) && typeof decoded['id'] === 'string') {
      return {
        patchId: decoded['id'],
        deprecated: decoded['deprecated'] === true,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/** Converts MarkerRecorded events into marker operations with patch metadata. */
export function createMarkerOperations(events: HistoryEvent[]): RuntimeOperation[] {
  return events
    .filter((event) => event.eventType === eventTypes.markerRecorded)
    .map((event) => {
      const attributes = readRecordField(event.raw, 'markerRecordedEventAttributes');
      const markerName = readStringField(attributes, 'markerName') ?? 'unknownMarker';
      const patch = markerName === 'core_patch' ? readPatchDetails(attributes) : undefined;

      return {
        id: `marker:${markerName}:${event.eventId}`,
        kind: 'marker' as const,
        markerName,
        ...(patch ? { patchId: patch.patchId, deprecated: patch.deprecated } : {}),
        recordedAt: event.eventTime,
        eventReferences: [createEventReference(event)],
      };
    });
}
