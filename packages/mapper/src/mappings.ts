import type {
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTraceDocument,
  SignalDefinition,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

function getEventIds(operation: RuntimeOperation): number[] {
  return operation.eventReferences.map((reference) => reference.eventId);
}

export function getCommandsOfKind(
  workflow: WorkflowDefinition,
  kind: TemporalCommand['kind'],
): TemporalCommand[] {
  return workflow.temporalCommands
    .filter((command) => command.kind === kind)
    .toSorted((left, right) => left.staticOrder - right.staticOrder);
}

function createWorkflowMapping(
  operation: RuntimeOperation,
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument,
): RuntimeNodeMapping {
  return {
    runtimeOperationId: operation.id,
    staticNodeId: workflow.id,
    confidence: 'exact',
    reason: `Workflow lifecycle event belongs to ${trace.execution.workflowType}.`,
    evidence: [
      {
        kind: 'workflow-type',
        description: `Runtime Workflow type ${trace.execution.workflowType} matched static Workflow ${workflow.name}.`,
        eventIds: getEventIds(operation),
        staticNodeId: workflow.id,
      },
      {
        kind: 'source-location',
        description: `Static Workflow source is ${workflow.source.path}:${workflow.source.start.line}.`,
        staticNodeId: workflow.id,
      },
    ],
  };
}

function createActivityMapping(
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

function createSignalMapping(
  operation: Extract<RuntimeOperation, { kind: 'signal' }>,
  signal: SignalDefinition,
): RuntimeNodeMapping {
  return {
    runtimeOperationId: operation.id,
    staticNodeId: signal.id,
    confidence: 'exact',
    reason: `Signal ${operation.signalName} matched a static Signal definition by name.`,
    evidence: [
      {
        kind: 'signal-name',
        description: `Runtime Signal ${operation.signalName} matched static Signal ${signal.name}.`,
        eventIds: getEventIds(operation),
        staticNodeId: signal.id,
      },
      {
        kind: 'source-location',
        description: `Static Signal source is ${signal.source.path}:${signal.source.start.line}.`,
        staticNodeId: signal.id,
      },
    ],
  };
}

function createTimerMapping(
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

function createUnmappedMapping(operation: RuntimeOperation, reason: string): RuntimeNodeMapping {
  return {
    runtimeOperationId: operation.id,
    confidence: 'unknown',
    reason,
    evidence: [
      {
        kind: 'unmapped',
        description: reason,
        eventIds: getEventIds(operation),
      },
    ],
  };
}

function mapActivityOperation(
  operation: Extract<RuntimeOperation, { kind: 'activity' }>,
  activityCommands: TemporalCommand[],
  occurrences: Map<string, number>,
): RuntimeNodeMapping {
  const occurrence = occurrences.get(operation.activityType) ?? 0;
  occurrences.set(operation.activityType, occurrence + 1);
  const command = activityCommands.filter((candidate) => candidate.name === operation.activityType)[
    occurrence
  ];

  return command
    ? createActivityMapping(operation, command, occurrence)
    : createUnmappedMapping(
        operation,
        `No static Activity command matched ${operation.activityType} occurrence ${occurrence + 1}.`,
      );
}

function mapSignalOperation(
  operation: Extract<RuntimeOperation, { kind: 'signal' }>,
  signals: SignalDefinition[],
): RuntimeNodeMapping {
  const signal = signals.find((candidate) => candidate.name === operation.signalName);

  return signal
    ? createSignalMapping(operation, signal)
    : createUnmappedMapping(
        operation,
        `No static Signal definition matched ${operation.signalName}.`,
      );
}

function mapTimerOperation(
  operation: Extract<RuntimeOperation, { kind: 'timer' }>,
  timerCommands: TemporalCommand[],
  occurrence: number,
  runtimeTimerCount: number,
): RuntimeNodeMapping {
  const command = timerCommands[occurrence];

  if (!command) {
    return createUnmappedMapping(
      operation,
      `No static timer command matched runtime timer occurrence ${occurrence + 1}.`,
    );
  }

  const confidence = timerCommands.length === 1 && runtimeTimerCount === 1 ? 'exact' : 'inferred';
  return createTimerMapping(operation, command, occurrence, confidence);
}

/** Maps every runtime operation in a trace to a static node or an explicit unmapped reason. */
export function createMappings(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument,
): RuntimeNodeMapping[] {
  const activityCommands = getCommandsOfKind(workflow, 'activity');
  const timerCommands = getCommandsOfKind(workflow, 'timer');
  const activityOccurrences = new Map<string, number>();
  const runtimeTimerCount = trace.operations.filter(
    (operation) => operation.kind === 'timer',
  ).length;
  let timerOccurrence = 0;

  return trace.operations.map((operation) => {
    if (operation.kind === 'workflow-lifecycle') {
      return createWorkflowMapping(operation, workflow, trace);
    }

    if (operation.kind === 'activity') {
      return mapActivityOperation(operation, activityCommands, activityOccurrences);
    }

    if (operation.kind === 'signal') {
      return mapSignalOperation(operation, workflow.messageSurface.signals);
    }

    if (operation.kind === 'timer') {
      const mapping = mapTimerOperation(
        operation,
        timerCommands,
        timerOccurrence,
        runtimeTimerCount,
      );
      timerOccurrence += 1;
      return mapping;
    }

    return createUnmappedMapping(
      operation,
      `Runtime operation ${operation.id} is not supported yet.`,
    );
  });
}
