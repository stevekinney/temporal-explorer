import type { PayloadReference, RuntimeOperation } from '@temporal-explorer/schemas';

import { eventTypes } from './event-types';
import { readRecordField, readStringField, type HistoryEvent } from './history-json';
import type { PayloadPreviewConfiguration } from './payloads';
import { collectPayloadIds, createEventReference } from './references';

type MutableUpdate = {
  accepted: HistoryEvent;
  updateId: string;
  updateName: string;
  payloadReferences: string[];
  closed?: { event: HistoryEvent; status: 'completed' | 'failed' };
};

function recordAcceptedUpdate(
  event: HistoryEvent,
  updates: Map<string, MutableUpdate>,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  const attributes = readRecordField(event.raw, 'workflowExecutionUpdateAcceptedEventAttributes');
  const acceptedRequest = readRecordField(attributes ?? {}, 'acceptedRequest');
  const meta = readRecordField(acceptedRequest ?? {}, 'meta');
  const input = readRecordField(acceptedRequest ?? {}, 'input');
  const updateId = readStringField(meta, 'updateId') ?? String(event.eventId);
  const updateName = readStringField(input, 'name') ?? 'unknownUpdate';

  updates.set(updateId, {
    accepted: event,
    updateId,
    updateName,
    payloadReferences: collectPayloadIds(
      payloads,
      event,
      readRecordField(input ?? {}, 'args'),
      'update',
      configuration,
    ),
  });
}

function recordCompletedUpdate(
  event: HistoryEvent,
  updates: Map<string, MutableUpdate>,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  const attributes = readRecordField(event.raw, 'workflowExecutionUpdateCompletedEventAttributes');
  const updateId = readStringField(readRecordField(attributes ?? {}, 'meta'), 'updateId');
  const update = updateId ? updates.get(updateId) : undefined;

  if (!update) {
    return;
  }

  const outcome = readRecordField(attributes ?? {}, 'outcome');
  const success = readRecordField(outcome ?? {}, 'success');
  const status = success ? ('completed' as const) : ('failed' as const);
  update.closed = { event, status };
  update.payloadReferences.push(
    ...collectPayloadIds(
      payloads,
      event,
      success,
      status === 'completed' ? 'result' : 'failure',
      configuration,
    ),
  );
}

/** Collapses Update accepted/completed events into Update operations. */
export function createUpdateOperations(
  events: HistoryEvent[],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): RuntimeOperation[] {
  const updates = new Map<string, MutableUpdate>();

  for (const event of events) {
    if (event.eventType === eventTypes.workflowExecutionUpdateAccepted) {
      recordAcceptedUpdate(event, updates, payloads, configuration);
    } else if (event.eventType === eventTypes.workflowExecutionUpdateCompleted) {
      recordCompletedUpdate(event, updates, payloads, configuration);
    }
  }

  return [...updates.values()]
    .toSorted((left, right) => left.accepted.eventId - right.accepted.eventId)
    .map((update) => ({
      id: `update:${update.updateName}:${update.accepted.eventId}`,
      kind: 'update' as const,
      updateId: update.updateId,
      updateName: update.updateName,
      status: update.closed?.status ?? ('accepted' as const),
      acceptedAt: update.accepted.eventTime,
      ...(update.closed ? { closedAt: update.closed.event.eventTime } : {}),
      eventReferences: [
        createEventReference(update.accepted),
        ...(update.closed ? [createEventReference(update.closed.event)] : []),
      ],
      payloadReferences: update.payloadReferences,
    }));
}
