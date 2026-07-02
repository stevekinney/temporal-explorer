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

type ChildStatus =
  'startFailed' | 'started' | 'completed' | 'failed' | 'canceled' | 'timedOut' | 'terminated';

type MutableChildWorkflow = {
  initiated: HistoryEvent;
  workflowType: string;
  childWorkflowId: string;
  childRunId?: string;
  payloadReferences: string[];
  progress: { event: HistoryEvent; status: ChildStatus }[];
};

const childProgressEvents = new Map<number, { attributesField: string; status: ChildStatus }>([
  [
    eventTypes.startChildWorkflowExecutionFailed,
    { attributesField: 'startChildWorkflowExecutionFailedEventAttributes', status: 'startFailed' },
  ],
  [
    eventTypes.childWorkflowExecutionStarted,
    { attributesField: 'childWorkflowExecutionStartedEventAttributes', status: 'started' },
  ],
  [
    eventTypes.childWorkflowExecutionCompleted,
    { attributesField: 'childWorkflowExecutionCompletedEventAttributes', status: 'completed' },
  ],
  [
    eventTypes.childWorkflowExecutionFailed,
    { attributesField: 'childWorkflowExecutionFailedEventAttributes', status: 'failed' },
  ],
  [
    eventTypes.childWorkflowExecutionCanceled,
    { attributesField: 'childWorkflowExecutionCanceledEventAttributes', status: 'canceled' },
  ],
  [
    eventTypes.childWorkflowExecutionTimedOut,
    { attributesField: 'childWorkflowExecutionTimedOutEventAttributes', status: 'timedOut' },
  ],
  [
    eventTypes.childWorkflowExecutionTerminated,
    { attributesField: 'childWorkflowExecutionTerminatedEventAttributes', status: 'terminated' },
  ],
]);

function recordInitiatedChild(
  event: HistoryEvent,
  children: Map<number, MutableChildWorkflow>,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  const attributes = readRecordField(
    event.raw,
    'startChildWorkflowExecutionInitiatedEventAttributes',
  );
  const workflowType =
    readStringField(readRecordField(attributes ?? {}, 'workflowType'), 'name') ??
    'unknownChildWorkflow';

  children.set(event.eventId, {
    initiated: event,
    workflowType,
    childWorkflowId: readStringField(attributes, 'workflowId') ?? String(event.eventId),
    payloadReferences: collectPayloadIds(
      payloads,
      event,
      readRecordField(attributes ?? {}, 'input'),
      'input',
      configuration,
    ),
    progress: [],
  });
}

function recordChildClosePayloads(
  event: HistoryEvent,
  child: MutableChildWorkflow,
  attributes: Record<string, unknown> | undefined,
  status: ChildStatus,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  if (status !== 'completed' && status !== 'failed') {
    return;
  }

  const field = status === 'completed' ? 'result' : 'failure';
  child.payloadReferences.push(
    ...collectPayloadIds(
      payloads,
      event,
      readRecordField(attributes ?? {}, field),
      field,
      configuration,
    ),
  );
}

function recordChildProgress(
  event: HistoryEvent,
  children: Map<number, MutableChildWorkflow>,
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): void {
  const progressKind = childProgressEvents.get(event.eventType);

  if (!progressKind) {
    return;
  }

  const attributes = readRecordField(event.raw, progressKind.attributesField);
  const initiatedEventId = readPositiveIntegerField(attributes, 'initiatedEventId');
  const child = initiatedEventId ? children.get(initiatedEventId) : undefined;

  if (!child) {
    return;
  }

  child.progress.push({ event, status: progressKind.status });

  const runId = readStringField(readRecordField(attributes ?? {}, 'workflowExecution'), 'runId');

  if (runId && !child.childRunId) {
    child.childRunId = runId;
  }

  recordChildClosePayloads(event, child, attributes, progressKind.status, payloads, configuration);
}

function isClosedStatus(status: ChildStatus): boolean {
  return status !== 'started';
}

/** Collapses child Workflow lifecycle events into child Workflow operations. */
export function createChildWorkflowOperations(
  events: HistoryEvent[],
  payloads: PayloadReference[],
  configuration: PayloadPreviewConfiguration,
): RuntimeOperation[] {
  const children = new Map<number, MutableChildWorkflow>();

  for (const event of events) {
    if (event.eventType === eventTypes.startChildWorkflowExecutionInitiated) {
      recordInitiatedChild(event, children, payloads, configuration);
    } else {
      recordChildProgress(event, children, payloads, configuration);
    }
  }

  return [...children.values()]
    .toSorted((left, right) => left.initiated.eventId - right.initiated.eventId)
    .map((child) => {
      const closed = child.progress.findLast((entry) => isClosedStatus(entry.status));

      return {
        id: `child-workflow:${child.workflowType}:${child.initiated.eventId}`,
        kind: 'child-workflow' as const,
        workflowType: child.workflowType,
        childWorkflowId: child.childWorkflowId,
        ...(child.childRunId ? { childRunId: child.childRunId } : {}),
        status: closed?.status ?? child.progress.at(-1)?.status ?? ('initiated' as const),
        initiatedAt: child.initiated.eventTime,
        ...(closed ? { closedAt: closed.event.eventTime } : {}),
        eventReferences: [
          createEventReference(child.initiated),
          ...child.progress.map((entry) => createEventReference(entry.event)),
        ],
        payloadReferences: child.payloadReferences,
      };
    });
}
