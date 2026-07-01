import type { Diagnostic } from '@temporal-explorer/schemas';

import { isKnownEventType } from './event-types';
import type { HistoryEvent } from './history-json';

export function createUnknownEventDiagnostics(events: HistoryEvent[]): Diagnostic[] {
  return events
    .filter((event) => !isKnownEventType(event.eventType))
    .map((event) => ({
      code: 'TEH_UNKNOWN_EVENT_TYPE',
      category: 'history',
      severity: 'warning',
      message: `Unsupported Event History event type ${event.eventType} at event ${event.eventId}.`,
      confidence: 'unknown',
    }));
}
