import type {
  ExecutionOverlayDocument,
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTimelineEntry,
  RuntimeTraceDocument,
  SignalDefinition,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { sourceText } from './formatting';
import type { RuntimeOperationRow, TemporalGraphNode, TimelineRow } from './projection';
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
  type RuntimeOverlayState,
} from './runtime-state';

type ProjectionBuildContext = {
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>;
  operationsById: Map<string, RuntimeOperation>;
};

/** A static command that renders as a node in the sequential command chain. */
type GraphCommand = TemporalCommand & { kind: 'activity' | 'timer' | 'condition' };

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

/** Builds one node per Activity, Timer, and Condition command, ordered by staticOrder. */
export function createCommandGraphNodes(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode[] {
  return workflow.temporalCommands
    .filter(isGraphCommand)
    .toSorted((left, right) => left.staticOrder - right.staticOrder)
    .map((command, index) => createCommandGraphNode(command, index, trace, overlay, context));
}

/** Builds one node per static Signal declared on the workflow's message surface. */
export function createSignalGraphNodes(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode[] {
  return workflow.messageSurface.signals.map((signal, index) =>
    createSignalGraphNode(signal, index, trace, overlay, context),
  );
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
        fallbackPosition: { x: 320 + index * 280, y: 480 },
      })) ?? []
  );
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

function createCommandGraphNode(
  command: GraphCommand,
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
    kind: command.kind,
    state: commandState(
      command,
      overlay,
      trace?.operations ?? [],
      context.mappingsByRuntimeOperationId,
      fallbackObservedState(command.kind),
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

function createSignalGraphNode(
  signal: SignalDefinition,
  index: number,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode {
  const runtimeOperationIds = runtimeOperationIdsForNode(
    signal.id,
    context.mappingsByRuntimeOperationId,
  );

  return {
    id: signal.id,
    label: signal.name,
    kind: 'signal',
    state: commandState(
      signal,
      overlay,
      trace?.operations ?? [],
      context.mappingsByRuntimeOperationId,
      'observed',
    ),
    source: signal.source,
    sourceText: sourceText(signal.source),
    runtimeOperationIds,
    eventReferences: eventReferencesForOperationIds(runtimeOperationIds, context.operationsById),
    confidence: confidenceForOperationIds(
      runtimeOperationIds,
      context.mappingsByRuntimeOperationId,
    ),
    fallbackPosition: { x: 40, y: 320 + index * 160 },
  };
}

function fallbackObservedState(kind: GraphCommand['kind']): RuntimeOverlayState {
  if (kind === 'timer') return 'fired';
  if (kind === 'condition') return 'observed';

  return 'completed';
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

function isGraphCommand(command: TemporalCommand): command is GraphCommand {
  return command.kind === 'activity' || command.kind === 'timer' || command.kind === 'condition';
}
