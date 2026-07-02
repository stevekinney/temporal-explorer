/**
 * Temporal Event History event type identifiers.
 *
 * Values mirror `temporal.api.enums.v1.EventType` from the Temporal proto
 * definitions shipped with `@temporalio/proto`. The numeric values are part of
 * Temporal's public API surface and must not be reordered.
 */
export const eventTypes = {
  workflowExecutionStarted: 1,
  workflowExecutionCompleted: 2,
  workflowExecutionFailed: 3,
  workflowExecutionTimedOut: 4,
  workflowTaskScheduled: 5,
  workflowTaskStarted: 6,
  workflowTaskCompleted: 7,
  workflowTaskTimedOut: 8,
  workflowTaskFailed: 9,
  activityTaskScheduled: 10,
  activityTaskStarted: 11,
  activityTaskCompleted: 12,
  activityTaskFailed: 13,
  activityTaskTimedOut: 14,
  activityTaskCancelRequested: 15,
  activityTaskCanceled: 16,
  timerStarted: 17,
  timerFired: 18,
  timerCanceled: 19,
  workflowExecutionCancelRequested: 20,
  workflowExecutionCanceled: 21,
  requestCancelExternalWorkflowExecutionInitiated: 22,
  requestCancelExternalWorkflowExecutionFailed: 23,
  externalWorkflowExecutionCancelRequested: 24,
  markerRecorded: 25,
  workflowExecutionSignaled: 26,
  workflowExecutionTerminated: 27,
  workflowExecutionContinuedAsNew: 28,
  startChildWorkflowExecutionInitiated: 29,
  startChildWorkflowExecutionFailed: 30,
  childWorkflowExecutionStarted: 31,
  childWorkflowExecutionCompleted: 32,
  childWorkflowExecutionFailed: 33,
  childWorkflowExecutionCanceled: 34,
  childWorkflowExecutionTimedOut: 35,
  childWorkflowExecutionTerminated: 36,
  signalExternalWorkflowExecutionInitiated: 37,
  signalExternalWorkflowExecutionFailed: 38,
  externalWorkflowExecutionSignaled: 39,
  upsertWorkflowSearchAttributes: 40,
  workflowExecutionUpdateAccepted: 41,
  workflowExecutionUpdateRejected: 42,
  workflowExecutionUpdateCompleted: 43,
  workflowPropertiesModifiedExternally: 44,
  activityPropertiesModifiedExternally: 45,
  workflowPropertiesModified: 46,
  workflowExecutionUpdateAdmitted: 47,
} as const;

const eventTypeNames = new Map<number, string>([
  [eventTypes.workflowExecutionStarted, 'WorkflowExecutionStarted'],
  [eventTypes.workflowExecutionCompleted, 'WorkflowExecutionCompleted'],
  [eventTypes.workflowExecutionFailed, 'WorkflowExecutionFailed'],
  [eventTypes.workflowExecutionTimedOut, 'WorkflowExecutionTimedOut'],
  [eventTypes.workflowTaskScheduled, 'WorkflowTaskScheduled'],
  [eventTypes.workflowTaskStarted, 'WorkflowTaskStarted'],
  [eventTypes.workflowTaskCompleted, 'WorkflowTaskCompleted'],
  [eventTypes.workflowTaskTimedOut, 'WorkflowTaskTimedOut'],
  [eventTypes.workflowTaskFailed, 'WorkflowTaskFailed'],
  [eventTypes.activityTaskScheduled, 'ActivityTaskScheduled'],
  [eventTypes.activityTaskStarted, 'ActivityTaskStarted'],
  [eventTypes.activityTaskCompleted, 'ActivityTaskCompleted'],
  [eventTypes.activityTaskFailed, 'ActivityTaskFailed'],
  [eventTypes.activityTaskTimedOut, 'ActivityTaskTimedOut'],
  [eventTypes.activityTaskCancelRequested, 'ActivityTaskCancelRequested'],
  [eventTypes.activityTaskCanceled, 'ActivityTaskCanceled'],
  [eventTypes.timerStarted, 'TimerStarted'],
  [eventTypes.timerFired, 'TimerFired'],
  [eventTypes.timerCanceled, 'TimerCanceled'],
  [eventTypes.workflowExecutionCancelRequested, 'WorkflowExecutionCancelRequested'],
  [eventTypes.workflowExecutionCanceled, 'WorkflowExecutionCanceled'],
  [
    eventTypes.requestCancelExternalWorkflowExecutionInitiated,
    'RequestCancelExternalWorkflowExecutionInitiated',
  ],
  [
    eventTypes.requestCancelExternalWorkflowExecutionFailed,
    'RequestCancelExternalWorkflowExecutionFailed',
  ],
  [eventTypes.externalWorkflowExecutionCancelRequested, 'ExternalWorkflowExecutionCancelRequested'],
  [eventTypes.markerRecorded, 'MarkerRecorded'],
  [eventTypes.workflowExecutionSignaled, 'WorkflowExecutionSignaled'],
  [eventTypes.workflowExecutionTerminated, 'WorkflowExecutionTerminated'],
  [eventTypes.workflowExecutionContinuedAsNew, 'WorkflowExecutionContinuedAsNew'],
  [eventTypes.startChildWorkflowExecutionInitiated, 'StartChildWorkflowExecutionInitiated'],
  [eventTypes.startChildWorkflowExecutionFailed, 'StartChildWorkflowExecutionFailed'],
  [eventTypes.childWorkflowExecutionStarted, 'ChildWorkflowExecutionStarted'],
  [eventTypes.childWorkflowExecutionCompleted, 'ChildWorkflowExecutionCompleted'],
  [eventTypes.childWorkflowExecutionFailed, 'ChildWorkflowExecutionFailed'],
  [eventTypes.childWorkflowExecutionCanceled, 'ChildWorkflowExecutionCanceled'],
  [eventTypes.childWorkflowExecutionTimedOut, 'ChildWorkflowExecutionTimedOut'],
  [eventTypes.childWorkflowExecutionTerminated, 'ChildWorkflowExecutionTerminated'],
  [eventTypes.signalExternalWorkflowExecutionInitiated, 'SignalExternalWorkflowExecutionInitiated'],
  [eventTypes.signalExternalWorkflowExecutionFailed, 'SignalExternalWorkflowExecutionFailed'],
  [eventTypes.externalWorkflowExecutionSignaled, 'ExternalWorkflowExecutionSignaled'],
  [eventTypes.upsertWorkflowSearchAttributes, 'UpsertWorkflowSearchAttributes'],
  [eventTypes.workflowExecutionUpdateAccepted, 'WorkflowExecutionUpdateAccepted'],
  [eventTypes.workflowExecutionUpdateRejected, 'WorkflowExecutionUpdateRejected'],
  [eventTypes.workflowExecutionUpdateCompleted, 'WorkflowExecutionUpdateCompleted'],
  [eventTypes.workflowPropertiesModifiedExternally, 'WorkflowPropertiesModifiedExternally'],
  [eventTypes.activityPropertiesModifiedExternally, 'ActivityPropertiesModifiedExternally'],
  [eventTypes.workflowPropertiesModified, 'WorkflowPropertiesModified'],
  [eventTypes.workflowExecutionUpdateAdmitted, 'WorkflowExecutionUpdateAdmitted'],
]);

/** Returns the PascalCase Temporal event type name for a numeric event type. */
export function getEventTypeName(eventType: number): string {
  return eventTypeNames.get(eventType) ?? `UnknownEventType${eventType}`;
}

/** Reports whether the numeric event type is part of the supported event table. */
export function isKnownEventType(eventType: number): boolean {
  return eventTypeNames.has(eventType);
}
