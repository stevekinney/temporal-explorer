import type {
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTraceDocument,
  SignalDefinition,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import {
  createUnmappedMapping,
  mapCancelRequestOperation,
  mapChildWorkflowOperation,
  mapContinueAsNewOperation,
  mapDynamicActivityFallback,
  mapExternalSignalOperation,
  mapMarkerOperation,
  mapUpdateOperation,
} from './construct-mappings';
import { collectLoopCommandIds } from './loop-command-ids';

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

function mapActivityOperation(
  operation: Extract<RuntimeOperation, { kind: 'activity' }>,
  activityCommands: TemporalCommand[],
  dynamicCommands: TemporalCommand[],
  occurrences: Map<string, number>,
  loopCommandIds: Set<string>,
): RuntimeNodeMapping {
  const occurrence = occurrences.get(operation.activityType) ?? 0;
  occurrences.set(operation.activityType, occurrence + 1);
  const matching = activityCommands.filter(
    (candidate) => candidate.name === operation.activityType,
  );
  // A command that repeats — a fan-out template (`Promise.all(items.map(...))`) or any
  // command inside a loop body — is a single static node standing in for N runtime
  // executions, so every occurrence past the last static command maps back to it instead
  // of falling off the end into an unmapped, disconnected orphan node.
  const command =
    matching[occurrence] ??
    matching.find(
      (candidate) => candidate.cardinality === 'fan-out' || loopCommandIds.has(candidate.id),
    );

  if (command) {
    return createActivityMapping(operation, command, occurrence);
  }

  return (
    mapDynamicActivityFallback(operation, dynamicCommands) ??
    createUnmappedMapping(
      operation,
      `No static Activity command matched ${operation.activityType} occurrence ${occurrence + 1}.`,
    )
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

type MappingContext = {
  workflow: WorkflowDefinition;
  trace: RuntimeTraceDocument;
  activityCommands: TemporalCommand[];
  timerCommands: TemporalCommand[];
  dynamicCommands: TemporalCommand[];
  childCommands: TemporalCommand[];
  externalCommands: TemporalCommand[];
  patchCommands: TemporalCommand[];
  continueAsNewCommands: TemporalCommand[];
  activityOccurrences: Map<string, number>;
  childOccurrences: Map<string, number>;
  externalOccurrences: Map<string, number>;
  runtimeTimerCount: number;
  timerOccurrence: number;
  loopCommandIds: Set<string>;
};

function mapCoreOperation(
  operation: RuntimeOperation,
  context: MappingContext,
): RuntimeNodeMapping | undefined {
  switch (operation.kind) {
    case 'workflow-lifecycle':
      return createWorkflowMapping(operation, context.workflow, context.trace);
    case 'activity':
      return mapActivityOperation(
        operation,
        context.activityCommands,
        context.dynamicCommands,
        context.activityOccurrences,
        context.loopCommandIds,
      );
    case 'signal':
      return mapSignalOperation(operation, context.workflow.messageSurface.signals);
    case 'timer': {
      const mapping = mapTimerOperation(
        operation,
        context.timerCommands,
        context.timerOccurrence,
        context.runtimeTimerCount,
      );
      context.timerOccurrence += 1;
      return mapping;
    }
    default:
      return undefined;
  }
}

function mapExtendedOperation(
  operation: RuntimeOperation,
  context: MappingContext,
): RuntimeNodeMapping {
  switch (operation.kind) {
    case 'update':
      return mapUpdateOperation(operation, context.workflow.messageSurface.updates);
    case 'child-workflow':
      return mapChildWorkflowOperation(operation, context.childCommands, context.childOccurrences);
    case 'external-signal':
      return mapExternalSignalOperation(
        operation,
        context.externalCommands,
        context.externalOccurrences,
      );
    case 'marker':
      return mapMarkerOperation(operation, context.patchCommands);
    case 'continue-as-new':
      return mapContinueAsNewOperation(operation, context.continueAsNewCommands);
    case 'cancel-request':
      return mapCancelRequestOperation(operation, context.workflow);
    default:
      return createUnmappedMapping(
        operation,
        `Runtime operation ${operation.id} is not supported yet.`,
      );
  }
}

function mapOperation(operation: RuntimeOperation, context: MappingContext): RuntimeNodeMapping {
  return mapCoreOperation(operation, context) ?? mapExtendedOperation(operation, context);
}

/** Maps every runtime operation in a trace to a static node or an explicit unmapped reason. */
export function createMappings(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument,
): RuntimeNodeMapping[] {
  const context: MappingContext = {
    workflow,
    trace,
    activityCommands: getCommandsOfKind(workflow, 'activity'),
    timerCommands: getCommandsOfKind(workflow, 'timer'),
    dynamicCommands: getCommandsOfKind(workflow, 'dynamic'),
    childCommands: getCommandsOfKind(workflow, 'child-workflow'),
    externalCommands: getCommandsOfKind(workflow, 'external-workflow'),
    patchCommands: getCommandsOfKind(workflow, 'patch'),
    continueAsNewCommands: getCommandsOfKind(workflow, 'continue-as-new'),
    activityOccurrences: new Map(),
    childOccurrences: new Map(),
    externalOccurrences: new Map(),
    runtimeTimerCount: trace.operations.filter((operation) => operation.kind === 'timer').length,
    timerOccurrence: 0,
    loopCommandIds: collectLoopCommandIds(workflow.body.nodes),
  };

  return trace.operations.map((operation) => mapOperation(operation, context));
}
