import type { EventReference, PayloadReference } from '@temporal-explorer/schemas';

import type { HistoryEvent } from './history-json';
import { createPayloadReferences, type PayloadPreviewConfiguration } from './payloads';

export function createEventReference(event: HistoryEvent): EventReference {
  return {
    eventId: event.eventId,
    eventType: event.eventTypeName,
  };
}

export function getDurationMs(startedAt: string, closedAt?: string): number | undefined {
  if (!closedAt) {
    return undefined;
  }

  const duration = Date.parse(closedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

export function collectPayloadIds(
  payloads: PayloadReference[],
  event: HistoryEvent,
  container: Record<string, unknown> | undefined,
  kind: PayloadReference['kind'],
  configuration: PayloadPreviewConfiguration,
): string[] {
  const references = createPayloadReferences(event, container, kind, configuration);
  payloads.push(...references);
  return references.map((reference) => reference.id);
}
