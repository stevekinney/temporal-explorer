import type {
  RuntimeNodeMapping,
  RuntimeOperation,
  TemporalCommand,
} from '@temporal-explorer/schemas';

function getEventIds(operation: RuntimeOperation): number[] {
  return operation.eventReferences.map((reference) => reference.eventId);
}

export function createActivityMapping(
  operation: Extract<RuntimeOperation, { kind: 'activity' }>,
  command: TemporalCommand,
  occurrence: number,
): RuntimeNodeMapping {
  return {
    runtimeOperationId: operation.id,
    staticNodeId: command.id,
    confidence: 'exact',
    reason: `Activity ${operation.activityType} matched by Activity type and command order.`,
    evidence: [
      {
        kind: 'activity-type',
        description: `Runtime Activity type ${operation.activityType} matched static Activity command ${command.name}.`,
        eventIds: getEventIds(operation),
        staticNodeId: command.id,
      },
      {
        kind: 'command-order',
        description: `Runtime Activity occurrence ${occurrence + 1} matched static command order ${command.staticOrder}.`,
        eventIds: getEventIds(operation),
        staticNodeId: command.id,
      },
      {
        kind: 'source-location',
        description: `Static Activity source is ${command.source.path}:${command.source.start.line}.`,
        staticNodeId: command.id,
      },
    ],
  };
}

export function createTimerMapping(
  operation: Extract<RuntimeOperation, { kind: 'timer' }>,
  command: TemporalCommand,
  occurrence: number,
  confidence: 'exact' | 'inferred',
): RuntimeNodeMapping {
  return {
    runtimeOperationId: operation.id,
    staticNodeId: command.id,
    confidence,
    reason:
      confidence === 'exact'
        ? 'The only runtime timer matched the only static timer.'
        : `Runtime timer occurrence ${occurrence + 1} matched static timer order ${command.staticOrder}.`,
    evidence: [
      {
        kind: 'timer-order',
        description: `Runtime timer ${operation.timerId} matched static timer command ${command.id} by start order.`,
        eventIds: getEventIds(operation),
        staticNodeId: command.id,
      },
      {
        kind: 'source-location',
        description: `Static timer source is ${command.source.path}:${command.source.start.line}.`,
        staticNodeId: command.id,
      },
    ],
  };
}
