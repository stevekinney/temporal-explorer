import type {
  ExecutionOverlayDocument,
  RuntimeTraceDocument,
  SourceLocation,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { sourceText } from './formatting';
import type { ProjectionBuildContext, TemporalGraphNode } from './projection';
import {
  confidenceForOperationIds,
  eventReferencesForOperationIds,
  findWorkflowRuntimeOperations,
  operationLabel,
  runtimeOperationIdsForNode,
} from './projection-helpers';
import { commandState, workflowState, type RuntimeOverlayState } from './runtime-state';

/** A static command that joins the sequential command chain, ordered by staticOrder. */
type GraphCommand = TemporalCommand & {
  kind:
    | 'activity'
    | 'timer'
    | 'condition'
    | 'child-workflow'
    | 'external-workflow'
    | 'continue-as-new'
    | 'patch'
    | 'dynamic';
};

/**
 * A cancellation scope: rendered as a node connected to the workflow node, but not
 * part of the sequential command chain since it contains other commands rather than
 * executing alongside them.
 */
type GraphScope = TemporalCommand & { kind: 'cancellation-scope' };

/** A definition from the workflow's message surface (Signal, Query, or Update). */
type MessageSurfaceDefinition = { id: string; name: string; source: SourceLocation };

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

/** Builds one node per command that joins the sequential chain, ordered by staticOrder. */
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

/**
 * Builds one node per cancellation scope. Scopes render as nodes connected to the
 * workflow node (like Signals) rather than joining the sequential command chain, since
 * a scope contains other commands instead of executing alongside them.
 */
export function createScopeGraphNodes(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode[] {
  return workflow.temporalCommands
    .filter(isScopeCommand)
    .toSorted((left, right) => left.staticOrder - right.staticOrder)
    .map((scope, index) => createScopeGraphNode(scope, index, trace, overlay, context));
}

/** Builds one node per static Signal declared on the workflow's message surface. */
export function createSignalGraphNodes(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode[] {
  return workflow.messageSurface.signals.map((signal, index) =>
    createMessageSurfaceGraphNode('signal', signal, index, 40, trace, overlay, context),
  );
}

/** Builds one node per static Query declared on the workflow's message surface. */
export function createQueryGraphNodes(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode[] {
  return workflow.messageSurface.queries.map((query, index) =>
    createMessageSurfaceGraphNode('query', query, index, 230, trace, overlay, context),
  );
}

/** Builds one node per static Update declared on the workflow's message surface. */
export function createUpdateGraphNodes(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode[] {
  return workflow.messageSurface.updates.map((update, index) =>
    createMessageSurfaceGraphNode('update', update, index, 420, trace, overlay, context),
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

function createScopeGraphNode(
  scope: GraphScope,
  index: number,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode {
  const runtimeOperationIds = runtimeOperationIdsForNode(
    scope.id,
    context.mappingsByRuntimeOperationId,
  );

  return {
    id: scope.id,
    label: scope.name,
    kind: 'cancellation-scope',
    state: commandState(
      scope,
      overlay,
      trace?.operations ?? [],
      context.mappingsByRuntimeOperationId,
      'observed',
    ),
    source: scope.source,
    sourceText: sourceText(scope.source),
    runtimeOperationIds,
    eventReferences: eventReferencesForOperationIds(runtimeOperationIds, context.operationsById),
    confidence: confidenceForOperationIds(
      runtimeOperationIds,
      context.mappingsByRuntimeOperationId,
    ),
    fallbackPosition: { x: 610, y: 320 + index * 160 },
  };
}

function createMessageSurfaceGraphNode(
  kind: 'signal' | 'query' | 'update',
  definition: MessageSurfaceDefinition,
  index: number,
  columnX: number,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  context: ProjectionBuildContext,
): TemporalGraphNode {
  const runtimeOperationIds = runtimeOperationIdsForNode(
    definition.id,
    context.mappingsByRuntimeOperationId,
  );

  return {
    id: definition.id,
    label: definition.name,
    kind,
    state: commandState(
      definition,
      overlay,
      trace?.operations ?? [],
      context.mappingsByRuntimeOperationId,
      'observed',
    ),
    source: definition.source,
    sourceText: sourceText(definition.source),
    runtimeOperationIds,
    eventReferences: eventReferencesForOperationIds(runtimeOperationIds, context.operationsById),
    confidence: confidenceForOperationIds(
      runtimeOperationIds,
      context.mappingsByRuntimeOperationId,
    ),
    fallbackPosition: { x: columnX, y: 320 + index * 160 },
  };
}

function fallbackObservedState(kind: GraphCommand['kind']): RuntimeOverlayState {
  if (kind === 'timer') return 'fired';
  if (kind === 'condition' || kind === 'patch') return 'observed';

  return 'completed'; // activity, child-workflow, external-workflow, continue-as-new, dynamic
}

function isGraphCommand(command: TemporalCommand): command is GraphCommand {
  return (
    command.kind === 'activity' ||
    command.kind === 'timer' ||
    command.kind === 'condition' ||
    command.kind === 'child-workflow' ||
    command.kind === 'external-workflow' ||
    command.kind === 'continue-as-new' ||
    command.kind === 'patch' ||
    command.kind === 'dynamic'
  );
}

function isScopeCommand(command: TemporalCommand): command is GraphScope {
  return command.kind === 'cancellation-scope';
}
