import type { PayloadReference, RuntimeOperation } from '@temporal-explorer/schemas';

import { eventTypes } from './event-types';
import { readRecordField, readStringField, type HistoryEvent } from './history-json';
import type { PayloadPreviewConfiguration } from './payloads';
import { collectPayloadIds, createEventReference } from './references';

/** Collapses WorkflowExecutionSignaled events into Signal delivery operations. */
export function createSignalOperations(
  events: HistoryEvent[],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): RuntimeOperation[] {
  return events
    .filter((event) => event.eventType === eventTypes.workflowExecutionSignaled)
    .map((event) => {
      const attributes = readRecordField(event.raw, 'workflowExecutionSignaledEventAttributes');
      const signalName = readStringField(attributes, 'signalName') ?? 'unknownSignal';
      const input = readRecordField(attributes ?? {}, 'input');

      return {
        id: `signal:${signalName}:${event.eventId}`,
        kind: 'signal' as const,
        signalName,
        receivedAt: event.eventTime,
        eventReferences: [createEventReference(event)],
        payloadReferences: collectPayloadIds(payloads, event, input, 'signal', configuration),
      };
    });
}
