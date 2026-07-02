import type {
  RuntimeNodeMapping,
  RuntimeOperation,
  TemporalCommand,
  UpdateDefinition,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

function getEventIds(operation: RuntimeOperation): number[] {
  return operation.eventReferences.map((reference) => reference.eventId);
}

export function createUnmappedMapping(
  operation: RuntimeOperation,
  reason: string,
): RuntimeNodeMapping {
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

function createCommandMapping(
  operation: RuntimeOperation,
  command: TemporalCommand,
  confidence: RuntimeNodeMapping['confidence'],
  reason: string,
  evidenceKind:
    | 'update-name'
    | 'child-workflow-type'
    | 'external-signal-name'
    | 'patch-id'
    | 'continue-as-new'
    | 'dynamic-dispatch',
  evidenceDescription: string,
): RuntimeNodeMapping {
  return {
    runtimeOperationId: operation.id,
    staticNodeId: command.id,
    confidence,
    reason,
    evidence: [
      {
        kind: evidenceKind,
        description: evidenceDescription,
        eventIds: getEventIds(operation),
        staticNodeId: command.id,
      },
      {
        kind: 'source-location',
        description: `Static source is ${command.source.path}:${command.source.start.line}.`,
        staticNodeId: command.id,
      },
    ],
  };
}

export function mapUpdateOperation(
  operation: Extract<RuntimeOperation, { kind: 'update' }>,
  updates: UpdateDefinition[],
): RuntimeNodeMapping {
  const update = updates.find((candidate) => candidate.name === operation.updateName);

  if (!update) {
    return createUnmappedMapping(
      operation,
      `No static Update definition matched ${operation.updateName}.`,
    );
  }

  return {
    runtimeOperationId: operation.id,
    staticNodeId: update.id,
    confidence: 'exact',
    reason: `Update ${operation.updateName} matched a static Update definition by name.`,
    evidence: [
      {
        kind: 'update-name',
        description: `Runtime Update ${operation.updateName} matched static Update ${update.name}.`,
        eventIds: getEventIds(operation),
        staticNodeId: update.id,
      },
      {
        kind: 'source-location',
        description: `Static Update source is ${update.source.path}:${update.source.start.line}.`,
        staticNodeId: update.id,
      },
    ],
  };
}

export function mapChildWorkflowOperation(
  operation: Extract<RuntimeOperation, { kind: 'child-workflow' }>,
  childCommands: TemporalCommand[],
  occurrences: Map<string, number>,
): RuntimeNodeMapping {
  const occurrence = occurrences.get(operation.workflowType) ?? 0;
  occurrences.set(operation.workflowType, occurrence + 1);
  const command = childCommands.filter((candidate) => candidate.name === operation.workflowType)[
    occurrence
  ];

  if (!command) {
    return createUnmappedMapping(
      operation,
      `No static child Workflow command matched ${operation.workflowType} occurrence ${occurrence + 1}.`,
    );
  }

  return createCommandMapping(
    operation,
    command,
    'exact',
    `Child Workflow ${operation.workflowType} matched by Workflow type and command order.`,
    'child-workflow-type',
    `Runtime child Workflow type ${operation.workflowType} matched static command ${command.id}.`,
  );
}

export function mapExternalSignalOperation(
  operation: Extract<RuntimeOperation, { kind: 'external-signal' }>,
  externalCommands: TemporalCommand[],
  occurrences: Map<string, number>,
): RuntimeNodeMapping {
  const occurrence = occurrences.get(operation.signalName) ?? 0;
  occurrences.set(operation.signalName, occurrence + 1);
  const command = externalCommands.filter((candidate) => candidate.name === operation.signalName)[
    occurrence
  ];

  if (!command) {
    return createUnmappedMapping(
      operation,
      `No static external Workflow command matched signal ${operation.signalName}.`,
    );
  }

  return createCommandMapping(
    operation,
    command,
    'exact',
    `External signal ${operation.signalName} matched by signal name.`,
    'external-signal-name',
    `Runtime external signal ${operation.signalName} matched static command ${command.id}.`,
  );
}

export function mapMarkerOperation(
  operation: Extract<RuntimeOperation, { kind: 'marker' }>,
  patchCommands: TemporalCommand[],
): RuntimeNodeMapping {
  if (!operation.patchId) {
    return createUnmappedMapping(
      operation,
      `Marker ${operation.markerName} has no static counterpart.`,
    );
  }

  const command = patchCommands.find((candidate) => candidate.name === operation.patchId);

  if (!command) {
    return createUnmappedMapping(
      operation,
      `No static patch matched patch ID ${operation.patchId}.`,
    );
  }

  return createCommandMapping(
    operation,
    command,
    'exact',
    `Patch marker ${operation.patchId} matched a static patch call by patch ID.`,
    'patch-id',
    `Runtime patch marker ${operation.patchId} matched static patch ${command.id}.`,
  );
}

export function mapContinueAsNewOperation(
  operation: Extract<RuntimeOperation, { kind: 'continue-as-new' }>,
  continueAsNewCommands: TemporalCommand[],
): RuntimeNodeMapping {
  const [command] = continueAsNewCommands;

  if (!command) {
    return createUnmappedMapping(
      operation,
      'No static continue-as-new call matched the runtime rollover.',
    );
  }

  return createCommandMapping(
    operation,
    command,
    continueAsNewCommands.length === 1 ? 'exact' : 'inferred',
    'Continue-as-new matched the static continue-as-new call.',
    'continue-as-new',
    `Runtime continue-as-new matched static command ${command.id}.`,
  );
}

export function mapCancelRequestOperation(
  operation: Extract<RuntimeOperation, { kind: 'cancel-request' }>,
  workflow: WorkflowDefinition,
): RuntimeNodeMapping {
  return {
    runtimeOperationId: operation.id,
    staticNodeId: workflow.id,
    confidence: 'exact',
    reason: 'Cancellation was requested for the Workflow Execution.',
    evidence: [
      {
        kind: 'workflow-type',
        description: `Cancellation request belongs to Workflow ${workflow.name}.`,
        eventIds: getEventIds(operation),
        staticNodeId: workflow.id,
      },
    ],
  };
}

/** Maps an Activity operation that matched no static Activity to a dynamic dispatch site. */
export function mapDynamicActivityFallback(
  operation: Extract<RuntimeOperation, { kind: 'activity' }>,
  dynamicCommands: TemporalCommand[],
): RuntimeNodeMapping | undefined {
  const [command] = dynamicCommands;

  if (!command) {
    return undefined;
  }

  return createCommandMapping(
    operation,
    command,
    'dynamic',
    `Activity ${operation.activityType} was dispatched dynamically; the static call site cannot name it.`,
    'dynamic-dispatch',
    `Runtime Activity ${operation.activityType} attributed to dynamic dispatch site ${command.name}.`,
  );
}
