import type {
  ExecutionOverlayDocument,
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTimelineEntry,
  RuntimeTraceDocument,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { sourceText } from './formatting';
import type {
  RuntimeOperationRow,
  TemporalGraphEdge,
  TemporalGraphNode,
  TimelineRow,
} from './projection';
import {
  confidenceForOperationIds,
  eventReferencesForOperationIds,
  findWorkflowRuntimeOperations,
  operationEventReferences,
  operationLabel,
  runtimeOperationIdsForNode,
} from './projection-helpers';
import {
  commandState,
  operationState,
  runtimeOperationRowState,
  workflowState,
} from './runtime-state';

type ProjectionBuildContext = {
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>;
  operationsById: Map<string, RuntimeOperation>;
};

export function createWorkflowGraphNode(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode {
  const runtimeOperationIds = findWorkflowRuntimeOperations(trace).map((operation) => operation.id);

  return {
    id: workflow.id,
    label: workflow.name,
    kind: 'workflow',
    state: workflowState(trace),
    source: workflow.source,
    sourceText: sourceText(workflow.source),
    runtimeOperationIds,
    eventReferences: eventReferencesForOperationIds(runtimeOperationIds, context.operationsById),
    confidence: confidenceForOperationIds(
      runtimeOperationIds,
      context.mappingsByRuntimeOperationId,
    ),
    fallbackPosition: { x: 40, y: 120 },
  };
}

export function createActivityGraphNodes(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode[] {
  return workflow.temporalCommands
    .filter(isActivityCommand)
    .toSorted((left, right) => left.staticOrder - right.staticOrder)
    .map((command, index) => createActivityGraphNode(command, index, trace, overlay, context));
}

export function createUnmappedRuntimeNodes(
  trace: RuntimeTraceDocument | undefined,
  mappedRuntimeOperationIds: Set<string>,
): TemporalGraphNode[] {
  return (
    trace?.operations
      .filter(
        (operation) =>
          operation.kind === 'unmapped' ||
          (!mappedRuntimeOperationIds.has(operation.id) && operation.kind !== 'workflow-lifecycle'),
      )
      .map((operation, index) => ({
        id: `runtime:${operation.id}`,
        label: operationLabel(operation),
        kind: 'runtime',
        state: 'unmapped',
        source: undefined,
        sourceText: 'not resolved',
        runtimeOperationIds: [operation.id],
        eventReferences: operation.eventReferences,
        confidence: 'unknown',
        fallbackPosition: { x: 320 + index * 280, y: 340 },
      })) ?? []
  );
}

export function createGraphEdges(
  workflowNode: TemporalGraphNode,
  activityNodes: TemporalGraphNode[],
): TemporalGraphEdge[] {
  return [workflowNode, ...activityNodes].slice(1).map((node, index, staticEdgeNodes) => {
    const source = staticEdgeNodes[index]?.id ?? workflowNode.id;

    return {
      id: `edge:${source}->${node.id}`,
      source,
      target: node.id,
      label: node.kind === 'activity' ? `Activity ${index + 1}` : 'Workflow path',
      state: node.state,
      runtimeOperationIds: node.runtimeOperationIds,
      eventReferences: node.eventReferences,
    };
  });
}

export function createTimelineRows(
  trace: RuntimeTraceDocument | undefined,
  workflowNodeId: string,
  nodes: TemporalGraphNode[],
  context: ProjectionBuildContext,
): TimelineRow[] {
  return (
    trace?.timeline.map((entry) => createTimelineRow(entry, workflowNodeId, nodes, context)) ?? []
  );
}

export function createRuntimeOperationRows(
  trace: RuntimeTraceDocument | undefined,
  workflowNodeId: string,
  nodes: TemporalGraphNode[],
  context: ProjectionBuildContext,
): RuntimeOperationRow[] {
  return (
    trace?.operations.map((operation) =>
      createRuntimeOperationRow(operation, workflowNodeId, nodes, context),
    ) ?? []
  );
}

function createActivityGraphNode(
  command: TemporalCommand,
  index: number,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode {
  const runtimeOperationIds = runtimeOperationIdsForNode(
    command.id,
    context.mappingsByRuntimeOperationId,
  );

  return {
    id: command.id,
    label: command.name,
    kind: 'activity',
    state: commandState(
      command,
      overlay,
      trace?.operations ?? [],
      context.mappingsByRuntimeOperationId,
    ),
    source: command.source,
    sourceText: sourceText(command.source),
    runtimeOperationIds,
    eventReferences: eventReferencesForOperationIds(runtimeOperationIds, context.operationsById),
    confidence: confidenceForOperationIds(
      runtimeOperationIds,
      context.mappingsByRuntimeOperationId,
    ),
    fallbackPosition: { x: 320 + index * 280, y: 120 },
  };
}

function createTimelineRow(
  entry: RuntimeTimelineEntry,
  workflowNodeId: string,
  nodes: TemporalGraphNode[],
  context: ProjectionBuildContext,
): TimelineRow {
  const operation = context.operationsById.get(entry.operationId);
  const graphNodeId = graphNodeIdForOperation(
    entry.operationId,
    operation,
    workflowNodeId,
    context,
  );
  const node = graphNodeId ? nodes.find((candidate) => candidate.id === graphNodeId) : undefined;

  return {
    id: entry.id,
    entry,
    operation,
    graphNodeId,
    state: operationState(operation),
    sourceText: node?.sourceText ?? 'not resolved',
    eventReferences: operationEventReferences(operation),
  };
}

function createRuntimeOperationRow(
  operation: RuntimeOperation,
  workflowNodeId: string,
  nodes: TemporalGraphNode[],
  context: ProjectionBuildContext,
): RuntimeOperationRow {
  const mapping = context.mappingsByRuntimeOperationId.get(operation.id);
  const graphNodeId = graphNodeIdForOperation(operation.id, operation, workflowNodeId, context);
  const node = graphNodeId ? nodes.find((candidate) => candidate.id === graphNodeId) : undefined;

  return {
    operation,
    graphNodeId,
    state: runtimeOperationRowState(mapping, operation),
    sourceText: node?.sourceText ?? 'not resolved',
    mapping,
  };
}

function graphNodeIdForOperation(
  operationId: string,
  operation: RuntimeOperation | undefined,
  workflowNodeId: string,
  context: ProjectionBuildContext,
): string | undefined {
  return (
    context.mappingsByRuntimeOperationId.get(operationId)?.staticNodeId ??
    (operation?.kind === 'workflow-lifecycle' ? workflowNodeId : undefined)
  );
}

function isActivityCommand(command: TemporalCommand): boolean {
  return command.kind === 'activity';
}
