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

export function getWorkflowClosedStatus(
  eventType: number,
): RuntimeTraceDocument['execution']['status'] {
  if (eventType === eventTypes.workflowExecutionCompleted) {
    return 'completed';
  }

  if (eventType === eventTypes.workflowExecutionFailed) {
    return 'failed';
  }

  if (eventType === eventTypes.workflowExecutionCanceled) {
    return 'canceled';
  }

  if (eventType === eventTypes.workflowExecutionTerminated) {
    return 'terminated';
  }

  return 'timedOut';
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
  ]);

  return events.find((event) => closedEventTypes.has(event.eventType));
}

function collectWorkflowClosePayloads(
  payloads: PayloadReference[],
  closed: HistoryEvent | undefined,
  configuration: PayloadPreviewConfiguration,
): string[] {
  if (!closed) {
    return [];
  }

  const attributes = readRecordField(closed.raw, 'workflowExecutionCompletedEventAttributes');
  return collectPayloadIds(
    payloads,
    closed,
    readRecordField(attributes ?? {}, 'result'),
    'result',
    configuration,
  );
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
    operations.push({
      id: `workflow:${getWorkflowClosedStatus(closed.eventType)}`,
      kind: 'workflow-lifecycle',
      status: getWorkflowClosedStatus(closed.eventType) === 'completed' ? 'completed' : 'failed',
      eventReferences: [createEventReference(closed)],
      payloadReferences: closePayloads,
    });
  }

  return operations;
}
