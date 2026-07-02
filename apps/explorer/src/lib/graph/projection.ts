import type {
  EventReference,
  ExecutionOverlayDocument,
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTimelineEntry,
  RuntimeTraceDocument,
  SourceLocation,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { formatEventReferences, sourceText } from './formatting';
import {
  createCommandGraphNodes,
  createQueryGraphNodes,
  createScopeGraphNodes,
  createSignalGraphNodes,
  createUnmappedRuntimeNodes,
  createUpdateGraphNodes,
  createWorkflowGraphNode,
} from './projection-builders';
import { createGraphEdges } from './projection-edges';
import { createStatusCounts } from './projection-helpers';
import { createRuntimeOperationRows, createTimelineRows } from './projection-rows';
import { runtimeOverlayStates, runtimeStateToken, type RuntimeOverlayState } from './runtime-state';

export {
  formatEventReferences,
  runtimeOverlayStates,
  runtimeStateToken,
  sourceText,
  type RuntimeOverlayState,
};

/** Shared lookups passed to every graph node and row builder. */
export type ProjectionBuildContext = {
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>;
  operationsById: Map<string, RuntimeOperation>;
};

export type TemporalGraphNode = {
  id: string;
  label: string;
  kind:
    | 'workflow'
    | 'activity'
    | 'timer'
    | 'condition'
    | 'signal'
    | 'query'
    | 'update'
    | 'child-workflow'
    | 'external-workflow'
    | 'continue-as-new'
    | 'patch'
    | 'cancellation-scope'
    | 'dynamic'
    | 'runtime';
  state: RuntimeOverlayState;
  source: SourceLocation | undefined;
  sourceText: string;
  runtimeOperationIds: string[];
  eventReferences: EventReference[];
  confidence: RuntimeNodeMapping['confidence'] | 'unknown';
  fallbackPosition: { x: number; y: number };
};

export type TemporalGraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  state: RuntimeOverlayState;
  runtimeOperationIds: string[];
  eventReferences: EventReference[];
};

export type TimelineRow = {
  id: string;
  entry: RuntimeTimelineEntry;
  operation: RuntimeOperation | undefined;
  graphNodeId: string | undefined;
  state: RuntimeOverlayState;
  sourceText: string;
  eventReferences: EventReference[];
};

export type RuntimeOperationRow = {
  operation: RuntimeOperation;
  graphNodeId: string | undefined;
  state: RuntimeOverlayState;
  sourceText: string;
  mapping: RuntimeNodeMapping | undefined;
};

export type GraphProjection = {
  nodes: TemporalGraphNode[];
  edges: TemporalGraphEdge[];
  timelineRows: TimelineRow[];
  runtimeOperationRows: RuntimeOperationRow[];
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>;
  nodesById: Map<string, TemporalGraphNode>;
  edgesById: Map<string, TemporalGraphEdge>;
  operationsById: Map<string, RuntimeOperation>;
  statusCounts: Map<RuntimeOverlayState, number>;
};

export function buildGraphProjection({
  workflow,
  trace,
  overlay,
}: {
  workflow: WorkflowDefinition;
  trace: RuntimeTraceDocument | undefined;
  overlay: ExecutionOverlayDocument | undefined;
}): GraphProjection {
  const mappingsByRuntimeOperationId = new Map(
    overlay?.mappings.map((mapping) => [mapping.runtimeOperationId, mapping]) ?? [],
  );
  const operationsById = new Map(
    trace?.operations.map((operation) => [operation.id, operation]) ?? [],
  );
  const context = { mappingsByRuntimeOperationId, operationsById };
  const workflowNode = createWorkflowGraphNode(workflow, trace, context);
  const commandNodes = createCommandGraphNodes(workflow, trace, overlay, context);
  const signalNodes = createSignalGraphNodes(workflow, trace, overlay, context);
  const queryNodes = createQueryGraphNodes(workflow, trace, overlay, context);
  const updateNodes = createUpdateGraphNodes(workflow, trace, overlay, context);
  const scopeNodes = createScopeGraphNodes(workflow, trace, overlay, context);
  const messageSurfaceNodes = [...signalNodes, ...queryNodes, ...updateNodes];
  const mappedRuntimeOperationIds = new Set(
    Array.from(mappingsByRuntimeOperationId.keys()).filter((operationId) =>
      Boolean(mappingsByRuntimeOperationId.get(operationId)?.staticNodeId),
    ),
  );
  const unmappedRuntimeNodes = createUnmappedRuntimeNodes(trace, mappedRuntimeOperationIds);
  const nodes = [
    workflowNode,
    ...commandNodes,
    ...messageSurfaceNodes,
    ...scopeNodes,
    ...unmappedRuntimeNodes,
  ];
  const edges = createGraphEdges(workflowNode, commandNodes, messageSurfaceNodes, scopeNodes);
  const timelineRows = createTimelineRows(trace, workflow.id, nodes, context);
  const runtimeOperationRows = createRuntimeOperationRows(trace, workflow.id, nodes, context);
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return {
    nodes,
    edges,
    timelineRows,
    runtimeOperationRows,
    mappingsByRuntimeOperationId,
    nodesById,
    edgesById,
    operationsById,
    statusCounts: createStatusCounts(nodes),
  };
}
