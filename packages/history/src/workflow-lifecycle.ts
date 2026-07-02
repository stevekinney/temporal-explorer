import type {
  PayloadReference,
  RuntimeOperation,
  RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

import { eventTypes } from './event-types';
import { readRecordField, readStringField, type HistoryEvent } from './history-json';
import type { PayloadPreviewConfiguration } from './payloads';
import { collectPayloadIds, createEventReference, getDurationMs } from './references';
import type { HistoryProvenance } from './trace-builder';

export type WorkflowLifecycle = {
  workflowStartedEvent: HistoryEvent;
  workflowClosedEvent?: HistoryEvent;
  workflowStartedAttributes: Record<string, unknown> | undefined;
  workflowType: string;
  workflowId: string;
  runId: string;
  operations: RuntimeOperation[];
};

export function createWorkflowLifecycle(
  events: HistoryEvent[],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
  provenance?: HistoryProvenance,
): WorkflowLifecycle {
  const workflowStartedEvent = getWorkflowStartedEvent(events);
  const workflowClosedEvent = findWorkflowClosedEvent(events);
  const workflowStartedAttributes = readRecordField(
    workflowStartedEvent.raw,
    'workflowExecutionStartedEventAttributes',
  );
  const workflowType = getWorkflowType(workflowStartedAttributes, provenance);
  const runId =
    readStringField(workflowStartedAttributes, 'originalExecutionRunId') ?? 'unknown-run-id';
  const workflowId = provenance?.workflowId ?? `${workflowType}-${runId}`;
  const startPayloads = collectPayloadIds(
    payloads,
    workflowStartedEvent,
    readRecordField(workflowStartedAttributes ?? {}, 'input'),
    'input',
    configuration,
  );
  const closePayloads = collectWorkflowClosePayloads(payloads, workflowClosedEvent, configuration);

  return {
    workflowStartedEvent,
    ...(workflowClosedEvent ? { workflowClosedEvent } : {}),
    workflowStartedAttributes,
    workflowType,
    workflowId,
    runId,
    operations: createWorkflowOperations(
      workflowStartedEvent,
      workflowClosedEvent,
      startPayloads,
      closePayloads,
    ),
  };
}

const closedStatusByEventType = new Map<number, RuntimeTraceDocument['execution']['status']>([
  [eventTypes.workflowExecutionCompleted, 'completed'],
  [eventTypes.workflowExecutionFailed, 'failed'],
  [eventTypes.workflowExecutionCanceled, 'canceled'],
  [eventTypes.workflowExecutionTerminated, 'terminated'],
  [eventTypes.workflowExecutionContinuedAsNew, 'continued-as-new'],
]);

export function getWorkflowClosedStatus(
  eventType: number,
): RuntimeTraceDocument['execution']['status'] {
  return closedStatusByEventType.get(eventType) ?? 'timedOut';
}

export function createWorkflowExecution(
  lifecycle: WorkflowLifecycle,
): RuntimeTraceDocument['execution'] {
  const closedEvent = lifecycle.workflowClosedEvent;

  return {
    workflowType: lifecycle.workflowType,
    workflowId: lifecycle.workflowId,
    runId: lifecycle.runId,
    status: closedEvent ? getWorkflowClosedStatus(closedEvent.eventType) : 'running',
    startedAt: lifecycle.workflowStartedEvent.eventTime,
    ...(closedEvent ? { closedAt: closedEvent.eventTime } : {}),
    ...(closedEvent
      ? {
          durationMs: getDurationMs(
            lifecycle.workflowStartedEvent.eventTime,
            closedEvent.eventTime,
          ),
        }
      : {}),
  };
}

function getWorkflowStartedEvent(events: HistoryEvent[]): HistoryEvent {
  const event = events.find(
    (candidate) => candidate.eventType === eventTypes.workflowExecutionStarted,
  );

  if (!event) {
    throw new Error('Event History is missing WorkflowExecutionStarted.');
  }

  return event;
}

function getWorkflowType(
  attributes: Record<string, unknown> | undefined,
  provenance?: HistoryProvenance,
): string {
  return (
    provenance?.workflowType ??
    readStringField(readRecordField(attributes ?? {}, 'workflowType'), 'name') ??
    'unknownWorkflow'
  );
}

function findWorkflowClosedEvent(events: HistoryEvent[]): HistoryEvent | undefined {
  const closedEventTypes = new Set<number>([
    eventTypes.workflowExecutionCompleted,
    eventTypes.workflowExecutionFailed,
    eventTypes.workflowExecutionTimedOut,
    eventTypes.workflowExecutionCanceled,
    eventTypes.workflowExecutionTerminated,
    eventTypes.workflowExecutionContinuedAsNew,
  ]);

  return events.find((event) => closedEventTypes.has(event.eventType));
}

const closePayloadFields = new Map<
  number,
  { attributesField: string; container: string; kind: PayloadReference['kind'] }
>([
  [
    eventTypes.workflowExecutionCompleted,
    {
      attributesField: 'workflowExecutionCompletedEventAttributes',
      container: 'result',
      kind: 'result',
    },
  ],
  [
    eventTypes.workflowExecutionFailed,
    {
      attributesField: 'workflowExecutionFailedEventAttributes',
      container: 'failure',
      kind: 'failure',
    },
  ],
  [
    eventTypes.workflowExecutionCanceled,
    {
      attributesField: 'workflowExecutionCanceledEventAttributes',
      container: 'details',
      kind: 'result',
    },
  ],
  [
    eventTypes.workflowExecutionContinuedAsNew,
    {
      attributesField: 'workflowExecutionContinuedAsNewEventAttributes',
      container: 'input',
      kind: 'input',
    },
  ],
]);

function collectWorkflowClosePayloads(
  payloads: PayloadReference[],
  closed: HistoryEvent | undefined,
  configuration: PayloadPreviewConfiguration,
): string[] {
  const fields = closed ? closePayloadFields.get(closed.eventType) : undefined;

  if (!closed || !fields) {
    return [];
  }

  const attributes = readRecordField(closed.raw, fields.attributesField);
  return collectPayloadIds(
    payloads,
    closed,
    readRecordField(attributes ?? {}, fields.container),
    fields.kind,
    configuration,
  );
}

/** Converts a WorkflowExecutionCancelRequested event into a cancel-request operation. */
export function createCancelRequestOperations(events: HistoryEvent[]): RuntimeOperation[] {
  return events
    .filter((event) => event.eventType === eventTypes.workflowExecutionCancelRequested)
    .map((event) => ({
      id: `cancel-request:${event.eventId}`,
      kind: 'cancel-request' as const,
      requestedAt: event.eventTime,
      eventReferences: [createEventReference(event)],
    }));
}

/** Converts a WorkflowExecutionContinuedAsNew event into a continue-as-new operation. */
export function createContinueAsNewOperations(
  events: HistoryEvent[],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): RuntimeOperation[] {
  return events
    .filter((event) => event.eventType === eventTypes.workflowExecutionContinuedAsNew)
    .map((event) => {
      const attributes = readRecordField(
        event.raw,
        'workflowExecutionContinuedAsNewEventAttributes',
      );
      const newRunId = readStringField(attributes, 'newExecutionRunId');

      return {
        id: `continue-as-new:${event.eventId}`,
        kind: 'continue-as-new' as const,
        ...(newRunId ? { newRunId } : {}),
        occurredAt: event.eventTime,
        eventReferences: [createEventReference(event)],
        payloadReferences: collectPayloadIds(
          payloads,
          event,
          readRecordField(attributes ?? {}, 'input'),
          'input',
          configuration,
        ),
      };
    });
}

function createWorkflowOperations(
  started: HistoryEvent,
  closed: HistoryEvent | undefined,
  startPayloads: string[],
  closePayloads: string[],
): RuntimeOperation[] {
  const operations: RuntimeOperation[] = [
    {
      id: 'workflow:start',
      kind: 'workflow-lifecycle',
      status: 'started',
      eventReferences: [createEventReference(started)],
      payloadReferences: startPayloads,
    },
  ];

  if (closed) {
    const closedStatus = getWorkflowClosedStatus(closed.eventType);
    operations.push({
      id: `workflow:${closedStatus}`,
      kind: 'workflow-lifecycle',
      status: closedStatus === 'running' ? 'completed' : closedStatus,
      eventReferences: [createEventReference(closed)],
      payloadReferences: closePayloads,
    });
  }

  return operations;
}
