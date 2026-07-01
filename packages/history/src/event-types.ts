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
  workflowExecutionCanceled: 17,
  workflowExecutionTerminated: 18,
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
  [eventTypes.workflowExecutionCanceled, 'WorkflowExecutionCanceled'],
  [eventTypes.workflowExecutionTerminated, 'WorkflowExecutionTerminated'],
]);

export function getEventTypeName(eventType: number): string {
  return eventTypeNames.get(eventType) ?? `UnknownEventType${eventType}`;
}

export function isKnownEventType(eventType: number): boolean {
  return eventTypeNames.has(eventType);
}
