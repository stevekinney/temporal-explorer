import {
  sourceText,
  type GraphProjection,
  type RuntimeOverlayState,
  type TemporalGraphEdge,
  type TemporalGraphNode,
  type TimelineRow,
} from '$lib/graph/projection';
import {
  formatDuration,
  formatTimestamp,
  operationDisplayName,
  operationKindLabel,
} from '$lib/graph/runtime-display';

import type {
  EventReference,
  RuntimeNodeMapping,
  RuntimeOperation,
  SourceLocation,
} from '@temporal-explorer/schemas';

import { sourceExcerpt, sourceLineText, type SourceExcerptLine } from './workflow-source-evidence';

export type WorkflowSelection =
  | { kind: 'node'; nodeId: string }
  | { kind: 'edge'; edgeId: string }
  | { kind: 'operation'; operationId: string }
  | { kind: 'none' };

export type SelectionFact = {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
};

export type SelectionDetail = {
  selection: WorkflowSelection;
  title: string;
  subtitle: string;
  state: RuntimeOverlayState | undefined;
  source: SourceLocation | undefined;
  sourceText: string;
  sourceLineText: string;
  sourceExcerptLines: SourceExcerptLine[];
  eventReferences: EventReference[];
  eventLedger: EventReference[];
  mapping: RuntimeNodeMapping | undefined;
  mappingFacts: SelectionFact[];
  runtimeFacts: SelectionFact[];
  timelineRows: TimelineRow[];
  node: TemporalGraphNode | undefined;
  edge: TemporalGraphEdge | undefined;
  operation: RuntimeOperation | undefined;
};

type SelectionContext = {
  operation: RuntimeOperation | undefined;
  node: TemporalGraphNode | undefined;
  mapping: RuntimeNodeMapping | undefined;
  timelineRows: TimelineRow[];
  eventReferences: EventReference[];
  title: string;
  source: SourceLocation | undefined;
  sourceLineText: string;
};

export function detailForSelection(
  projection: GraphProjection,
  selection: WorkflowSelection,
): SelectionDetail | undefined {
  if (selection.kind === 'none') return undefined;

  if (selection.kind === 'edge') return edgeSelectionDetail(projection, selection);

  return nodeOrOperationSelectionDetail(projection, selection);
}

function nodeOrOperationSelectionDetail(
  projection: GraphProjection,
  selection: Extract<WorkflowSelection, { kind: 'node' | 'operation' }>,
): SelectionDetail {
  const context = nodeOrOperationContext(projection, selection);
  return {
    selection,
    title: context.title,
    subtitle: selectionSubtitle(context.node, context.operation, context.mapping),
    state: selectedState(projection, context.operation, context.node),
    source: context.source,
    sourceText: context.node?.sourceText ?? sourceText(context.source),
    sourceLineText: context.sourceLineText,
    sourceExcerptLines: sourceExcerpt(context.source, context.sourceLineText),
    eventReferences: context.eventReferences,
    eventLedger: context.eventReferences,
    mapping: context.mapping,
    mappingFacts: mappingFacts(context.mapping, context.eventReferences),
    runtimeFacts: runtimeFacts(context.operation),
    timelineRows: context.timelineRows,
    node: context.node,
    edge: undefined,
    operation: context.operation,
  };
}

function nodeOrOperationContext(
  projection: GraphProjection,
  selection: Extract<WorkflowSelection, { kind: 'node' | 'operation' }>,
): SelectionContext {
  const operation = operationForSelection(projection, selection);
  const node = selectedNode(projection, selection, operation);
  const mapping = operation ? projection.mappingsByRuntimeOperationId.get(operation.id) : undefined;
  const title = operation ? operationDisplayName(operation) : (node?.label ?? 'Unknown selection');
  const sourceLine = sourceLineText(title, operation);

  return {
    operation,
    node,
    mapping,
    timelineRows: selectedTimelineRows(projection, selection, operation, node),
    eventReferences: operation?.eventReferences ?? node?.eventReferences ?? [],
    title,
    source: node?.source,
    sourceLineText: sourceLine,
  };
}

function operationForSelection(
  projection: GraphProjection,
  selection: Extract<WorkflowSelection, { kind: 'node' | 'operation' }>,
): RuntimeOperation | undefined {
  if (selection.kind === 'node') return undefined;
  return projection.operationsById.get(selection.operationId);
}

export function selectionFromNode(
  projection: GraphProjection | undefined,
  nodeId: string,
): WorkflowSelection {
  const node = projection?.nodesById.get(nodeId);
  const operationId = node?.runtimeOperationIds[0];
  return operationId ? { kind: 'operation', operationId } : { kind: 'node', nodeId };
}

export function selectionFromEdge(edgeId: string): WorkflowSelection {
  return { kind: 'edge', edgeId };
}

export function selectionFromTimelineRow(row: TimelineRow): WorkflowSelection {
  return { kind: 'operation', operationId: row.entry.operationId };
}

function edgeSelectionDetail(
  projection: GraphProjection,
  selection: Extract<WorkflowSelection, { kind: 'edge' }>,
): SelectionDetail | undefined {
  const edge = projection.edgesById.get(selection.edgeId);
  if (!edge) return undefined;

  const context = edgeSelectionContext(projection, selection, edge);

  return {
    selection,
    title: context.title,
    subtitle: `Control-flow edge · ${edge.state}`,
    state: edge.state,
    source: context.source,
    sourceText: context.node?.sourceText ?? 'not resolved',
    sourceLineText: context.sourceLineText,
    sourceExcerptLines: sourceExcerpt(context.source, context.sourceLineText),
    eventReferences: edge.eventReferences,
    eventLedger: edge.eventReferences,
    mapping: context.mapping,
    mappingFacts: mappingFacts(context.mapping, edge.eventReferences),
    runtimeFacts: context.operation ? runtimeFacts(context.operation) : [],
    timelineRows: context.timelineRows,
    node: context.node,
    edge,
    operation: context.operation,
  };
}

function edgeSelectionContext(
  projection: GraphProjection,
  selection: Extract<WorkflowSelection, { kind: 'edge' }>,
  edge: TemporalGraphEdge,
): SelectionContext {
  const operation = edge.runtimeOperationIds[0]
    ? projection.operationsById.get(edge.runtimeOperationIds[0])
    : undefined;
  const node = projection.nodesById.get(edge.target);
  const mapping = operation ? projection.mappingsByRuntimeOperationId.get(operation.id) : undefined;
  const title = edge.label || `${projection.nodesById.get(edge.source)?.label ?? 'Source'} path`;
  const sourceLine = edge.label || 'control-flow transition';

  return {
    operation,
    node,
    mapping,
    timelineRows: selectedTimelineRows(projection, selection, operation, node),
    eventReferences: edge.eventReferences,
    title,
    source: node?.source,
    sourceLineText: sourceLine,
  };
}

function selectedNode(
  projection: GraphProjection,
  selection: WorkflowSelection,
  operation: RuntimeOperation | undefined,
): TemporalGraphNode | undefined {
  if (selection.kind === 'node') return projection.nodesById.get(selection.nodeId);

  const row = operation
    ? projection.runtimeOperationRows.find((candidate) => candidate.operation.id === operation.id)
    : undefined;

  return row?.graphNodeId ? projection.nodesById.get(row.graphNodeId) : undefined;
}

function selectedState(
  projection: GraphProjection,
  operation: RuntimeOperation | undefined,
  node: TemporalGraphNode | undefined,
): RuntimeOverlayState | undefined {
  if (!operation) return node?.state;

  return projection.runtimeOperationRows.find((row) => row.operation.id === operation.id)?.state;
}

function selectedTimelineRows(
  projection: GraphProjection,
  selection: WorkflowSelection,
  operation: RuntimeOperation | undefined,
  node: TemporalGraphNode | undefined,
): TimelineRow[] {
  if (operation) {
    return projection.timelineRows.filter((row) => row.entry.operationId === operation.id);
  }

  if (selection.kind === 'edge') {
    const edge = projection.edgesById.get(selection.edgeId);
    const operationIds = new Set(edge?.runtimeOperationIds ?? []);
    return projection.timelineRows.filter((row) => operationIds.has(row.entry.operationId));
  }

  return node ? projection.timelineRows.filter((row) => row.graphNodeId === node.id) : [];
}

function selectionSubtitle(
  node: TemporalGraphNode | undefined,
  operation: RuntimeOperation | undefined,
  mapping: RuntimeNodeMapping | undefined,
): string {
  const subject = operation ? operationKindLabel(operation) : (node?.kind ?? 'source');
  const confidence = mapping?.confidence ? `${mapping.confidence} match` : 'static evidence';
  const state = node?.state ? ` · ${node.state}` : '';
  return `${subject} command${state} · ${confidence}`;
}

function mappingFacts(
  mapping: RuntimeNodeMapping | undefined,
  eventReferences: EventReference[],
): SelectionFact[] {
  if (!mapping) {
    return [
      { label: 'Match', value: eventReferences.length > 0 ? 'Runtime evidence' : 'Static only' },
    ];
  }

  return [
    { label: 'Match', value: `${mapping.confidence} match`, tone: mappingTone(mapping.confidence) },
    { label: 'Reason', value: mapping.reason },
    { label: 'Evidence', value: mapping.evidence.map((item) => item.description).join(' + ') },
  ];
}

function mappingTone(confidence: RuntimeNodeMapping['confidence']): SelectionFact['tone'] {
  if (confidence === 'exact') return 'success';
  if (confidence === 'ambiguous' || confidence === 'partial') return 'warning';
  if (confidence === 'unknown') return 'info';
  return 'neutral';
}

function runtimeFacts(operation: RuntimeOperation | undefined): SelectionFact[] {
  if (!operation) return [];

  if (operation.kind === 'activity') {
    return [
      { label: 'Status', value: operation.status, tone: statusTone(operation.status) },
      {
        label: 'Attempt',
        value: String(operation.attempts.at(-1)?.attempt ?? operation.attempts.length),
      },
      { label: 'Duration', value: formatDuration(operation.durationMs) },
      { label: 'Scheduled', value: formatTimestamp(operation.firstScheduledAt) },
    ];
  }

  if (operation.kind === 'timer') {
    return [
      { label: 'Status', value: operation.status, tone: statusTone(operation.status) },
      { label: 'Duration', value: operation.durationText ?? 'pending' },
      { label: 'Started', value: formatTimestamp(operation.startedAt) },
    ];
  }

  if (operation.kind === 'signal') {
    return [{ label: 'Received', value: formatTimestamp(operation.receivedAt) }];
  }

  if ('status' in operation) {
    return [{ label: 'Status', value: operation.status, tone: statusTone(operation.status) }];
  }

  if (operation.kind === 'unmapped') {
    return [{ label: 'Reason', value: operation.reason, tone: 'warning' }];
  }

  return [];
}

function statusTone(status: string): SelectionFact['tone'] {
  if (status === 'completed' || status === 'fired' || status === 'signaled') return 'success';
  if (status === 'failed' || status === 'timedOut' || status === 'canceled') return 'danger';
  if (status === 'pending' || status === 'initiated') return 'warning';
  return 'neutral';
}
