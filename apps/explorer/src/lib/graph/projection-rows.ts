import type {
  RuntimeOperation,
  RuntimeTimelineEntry,
  RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

import type {
  ProjectionBuildContext,
  RuntimeOperationRow,
  TemporalGraphNode,
  TimelineRow,
} from './projection';
import { operationEventReferences } from './projection-helpers';
import { operationState, runtimeOperationRowState } from './runtime-state';

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
