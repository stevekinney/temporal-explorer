import type {
  Diagnostic,
  ExecutionOverlayDocument,
  MappingEvidence,
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTraceDocument,
  StaticOverlayNode,
  TemporalAnalysisDocument,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

export type CreateExecutionOverlayOptions = {
  analysis: TemporalAnalysisDocument;
  trace: RuntimeTraceDocument;
  workflowName: string;
};

function getWorkflow(analysis: TemporalAnalysisDocument, workflowName: string): WorkflowDefinition {
  const workflow = analysis.workflows.find((candidate) => candidate.name === workflowName);

  if (!workflow) {
    throw new Error(`Workflow "${workflowName}" was not found in static analysis.`);
  }

  return workflow;
}

function isActivityOperation(
  operation: RuntimeOperation,
): operation is Extract<RuntimeOperation, { kind: 'activity' }> {
  return operation.kind === 'activity';
}

function getActivityCommands(workflow: WorkflowDefinition): TemporalCommand[] {
  return workflow.temporalCommands.filter((command) => command.kind === 'activity');
}

function getEventIds(operation: RuntimeOperation): number[] {
  return operation.eventReferences.map((reference) => reference.eventId);
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

function findActivityCommand(
  operation: Extract<RuntimeOperation, { kind: 'activity' }>,
  activityCommands: TemporalCommand[],
  occurrence: number,
): TemporalCommand | undefined {
  return activityCommands.filter((command) => command.name === operation.activityType)[occurrence];
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

function createMappings(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument,
): RuntimeNodeMapping[] {
  const activityCommands = getActivityCommands(workflow);
  const activityOccurrences = new Map<string, number>();

  return trace.operations.map((operation) => {
    if (operation.kind === 'workflow-lifecycle') {
      return createWorkflowMapping(operation, workflow, trace);
    }

    if (!isActivityOperation(operation)) {
      return createUnmappedMapping(
        operation,
        `Runtime operation ${operation.id} is not supported yet.`,
      );
    }

    const occurrence = activityOccurrences.get(operation.activityType) ?? 0;
    const command = findActivityCommand(operation, activityCommands, occurrence);
    activityOccurrences.set(operation.activityType, occurrence + 1);

    return command
      ? createActivityMapping(operation, command, occurrence)
      : createUnmappedMapping(
          operation,
          `No static Activity command matched ${operation.activityType} occurrence ${occurrence + 1}.`,
        );
  });
}

function createStaticNodes(
  workflow: WorkflowDefinition,
  mappings: RuntimeNodeMapping[],
): StaticOverlayNode[] {
  const observed = new Set(mappings.flatMap((mapping) => mapping.staticNodeId ?? []));
  const activityNodes = getActivityCommands(workflow).map((command) => ({
    id: command.id,
    kind: 'activity' as const,
    name: command.name,
    observed: observed.has(command.id),
    source: command.source,
  }));

  return [
    {
      id: workflow.id,
      kind: 'workflow',
      name: workflow.name,
      observed: observed.has(workflow.id),
      source: workflow.source,
    },
    ...activityNodes,
  ];
}

function createDiagnostics(mappings: RuntimeNodeMapping[]): Diagnostic[] {
  return mappings
    .filter((mapping) => !mapping.staticNodeId)
    .map((mapping) => ({
      code: 'TEM_UNMAPPED_RUNTIME_OPERATION',
      category: 'mapping',
      severity: 'warning',
      message: mapping.reason,
      confidence: mapping.confidence,
    }));
}

function createCoverage(
  staticNodes: StaticOverlayNode[],
  mappings: RuntimeNodeMapping[],
  trace: RuntimeTraceDocument,
): ExecutionOverlayDocument['coverage'] {
  const activityOperations = trace.operations.filter(isActivityOperation);
  const observedActivityIds = new Set(
    staticNodes.filter((node) => node.kind === 'activity' && node.observed).map((node) => node.id),
  );

  return {
    nodes: {
      total: staticNodes.length,
      observed: staticNodes.filter((node) => node.observed).length,
      skipped: staticNodes.filter((node) => !node.observed).length,
      unmappedRuntimeOperations: mappings.filter((mapping) => !mapping.staticNodeId).length,
    },
    activities: {
      staticTotal: staticNodes.filter((node) => node.kind === 'activity').length,
      observed: observedActivityIds.size,
      retried: activityOperations.filter((operation) => operation.attempts.length > 1).length,
      failed: activityOperations.filter((operation) => operation.status !== 'completed').length,
    },
    messages: {
      staticSignals: 0,
      receivedSignals: [],
      staticUpdates: 0,
      receivedUpdates: [],
      staticQueries: 0,
    },
    timers: {
      staticTotal: 0,
      fired: 0,
      canceled: 0,
      pending: 0,
    },
  };
}

export function createExecutionOverlay(
  options: CreateExecutionOverlayOptions,
): ExecutionOverlayDocument {
  const workflow = getWorkflow(options.analysis, options.workflowName);
  const mappings = createMappings(workflow, options.trace);
  const staticNodes = createStaticNodes(workflow, mappings);

  return {
    schemaVersion: 'temporal-overlay/v1',
    artifactId: `overlay:${options.workflowName}:${options.trace.artifactId}`,
    staticAnalysisId: options.analysis.artifactId,
    runtimeTraceId: options.trace.artifactId,
    workflow: options.workflowName,
    staticNodes,
    mappings,
    branchOutcomes: [],
    coverage: createCoverage(staticNodes, mappings, options.trace),
    diagnostics: createDiagnostics(mappings),
  };
}

function formatSource(node: StaticOverlayNode): string {
  return node.source ? `${node.source.path}:${node.source.start.line}` : 'unknown source';
}

function getMappingForNode(
  overlay: ExecutionOverlayDocument,
  node: StaticOverlayNode,
): RuntimeNodeMapping | undefined {
  return overlay.mappings.find((mapping) => mapping.staticNodeId === node.id);
}

export function createOverlayReport(overlay: ExecutionOverlayDocument): string {
  const lines = [
    `Trace Report: ${overlay.workflow}`,
    '',
    `Mapped runtime operations: ${overlay.mappings.length - overlay.coverage.nodes.unmappedRuntimeOperations}/${overlay.mappings.length}`,
    `Unmapped runtime operations: ${overlay.coverage.nodes.unmappedRuntimeOperations}`,
    '',
    'Executed Activities',
  ];

  for (const node of overlay.staticNodes.filter((candidate) => candidate.kind === 'activity')) {
    const mapping = getMappingForNode(overlay, node);
    const state = node.observed ? 'observed' : 'not observed';
    const confidence = mapping?.confidence ?? 'unknown';
    lines.push(`  ${node.name} (${state}) -> ${formatSource(node)} [${confidence}]`);

    if (mapping) {
      lines.push(`    ${mapping.reason}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export type { ExecutionOverlayDocument, MappingEvidence, RuntimeNodeMapping, StaticOverlayNode };
