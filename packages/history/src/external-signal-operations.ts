import type { PayloadReference, RuntimeOperation } from '@temporal-explorer/schemas';

import { eventTypes } from './event-types';
import {
  readPositiveIntegerField,
  readRecordField,
  readStringField,
  type HistoryEvent,
} from './history-json';
import type { PayloadPreviewConfiguration } from './payloads';
import { collectPayloadIds, createEventReference } from './references';

type MutableExternalSignal = {
  initiated: HistoryEvent;
  signalName: string;
  targetWorkflowId: string;
  targetRunId?: string;
  payloadReferences: string[];
  closed?: { event: HistoryEvent; status: 'signaled' | 'failed' };
};

function recordInitiatedExternalSignal(
  event: HistoryEvent,
  signals: Map<number, MutableExternalSignal>,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  const attributes = readRecordField(
    event.raw,
    'signalExternalWorkflowExecutionInitiatedEventAttributes',
  );
  const execution = readRecordField(attributes ?? {}, 'workflowExecution');

  signals.set(event.eventId, {
    initiated: event,
    signalName: readStringField(attributes, 'signalName') ?? 'unknownSignal',
    targetWorkflowId: readStringField(execution, 'workflowId') ?? 'unknown-workflow-id',
    payloadReferences: collectPayloadIds(
      payloads,
      event,
      readRecordField(attributes ?? {}, 'input'),
      'signal',
      configuration,
    ),
  });
}

function recordExternalSignalClose(
  event: HistoryEvent,
  signals: Map<number, MutableExternalSignal>,
  status: 'signaled' | 'failed',
  attributesField: string,
): void {
  const attributes = readRecordField(event.raw, attributesField);
  const initiatedEventId = readPositiveIntegerField(attributes, 'initiatedEventId');
  const signal = initiatedEventId ? signals.get(initiatedEventId) : undefined;

  if (!signal) {
    return;
  }

  signal.closed = { event, status };
  const runId = readStringField(readRecordField(attributes ?? {}, 'workflowExecution'), 'runId');

  if (runId) {
    signal.targetRunId = runId;
  }
}

/** Collapses external Workflow signal events into external-signal operations. */
export function createExternalSignalOperations(
  events: HistoryEvent[],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): RuntimeOperation[] {
  const signals = new Map<number, MutableExternalSignal>();

  for (const event of events) {
    if (event.eventType === eventTypes.signalExternalWorkflowExecutionInitiated) {
      recordInitiatedExternalSignal(event, signals, payloads, configuration);
    } else if (event.eventType === eventTypes.externalWorkflowExecutionSignaled) {
      recordExternalSignalClose(
        event,
        signals,
        'signaled',
        'externalWorkflowExecutionSignaledEventAttributes',
      );
    } else if (event.eventType === eventTypes.signalExternalWorkflowExecutionFailed) {
      recordExternalSignalClose(
        event,
        signals,
        'failed',
        'signalExternalWorkflowExecutionFailedEventAttributes',
      );
    }
  }

  return [...signals.values()]
    .toSorted((left, right) => left.initiated.eventId - right.initiated.eventId)
    .map((signal) => ({
      id: `external-signal:${signal.signalName}:${signal.initiated.eventId}`,
      kind: 'external-signal' as const,
      signalName: signal.signalName,
      targetWorkflowId: signal.targetWorkflowId,
      ...(signal.targetRunId ? { targetRunId: signal.targetRunId } : {}),
      status: signal.closed?.status ?? ('initiated' as const),
      initiatedAt: signal.initiated.eventTime,
      ...(signal.closed ? { closedAt: signal.closed.event.eventTime } : {}),
      eventReferences: [
        createEventReference(signal.initiated),
        ...(signal.closed ? [createEventReference(signal.closed.event)] : []),
      ],
      payloadReferences: signal.payloadReferences,
    }));
}
