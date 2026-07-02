import type { TemporalGraphEdge, TemporalGraphNode } from './projection';

/**
 * Builds the graph edges: a sequential chain across Activity, Timer, and Condition
 * commands (in staticOrder) so the flow view shows waits between them, plus a
 * separate `signal` edge from each Signal node into the workflow node.
 */
export function createGraphEdges(
  workflowNode: TemporalGraphNode,
  commandNodes: TemporalGraphNode[],
  signalNodes: TemporalGraphNode[],
): TemporalGraphEdge[] {
  return [
    ...createSequentialGraphEdges(workflowNode, commandNodes),
    ...createSignalGraphEdges(workflowNode, signalNodes),
  ];
}

function createSequentialGraphEdges(
  workflowNode: TemporalGraphNode,
  commandNodes: TemporalGraphNode[],
): TemporalGraphEdge[] {
  const occurrenceByKind = new Map<TemporalGraphNode['kind'], number>();

  return commandNodes.map((node, index) => {
    const source = commandNodes[index - 1]?.id ?? workflowNode.id;
    const occurrence = (occurrenceByKind.get(node.kind) ?? 0) + 1;
    occurrenceByKind.set(node.kind, occurrence);

    return {
      id: `edge:${source}->${node.id}`,
      source,
      target: node.id,
      label: sequentialEdgeLabel(node.kind, occurrence),
      state: node.state,
      runtimeOperationIds: node.runtimeOperationIds,
      eventReferences: node.eventReferences,
    };
  });
}

function createSignalGraphEdges(
  workflowNode: TemporalGraphNode,
  signalNodes: TemporalGraphNode[],
): TemporalGraphEdge[] {
  return signalNodes.map((node) => ({
    id: `edge:${node.id}->${workflowNode.id}`,
    source: node.id,
    target: workflowNode.id,
    label: 'signal',
    state: node.state,
    runtimeOperationIds: node.runtimeOperationIds,
    eventReferences: node.eventReferences,
  }));
}

function sequentialEdgeLabel(kind: TemporalGraphNode['kind'], occurrence: number): string {
  if (kind === 'activity') return `Activity ${occurrence}`;
  if (kind === 'timer') return `Timer ${occurrence}`;
  if (kind === 'condition') return `Condition ${occurrence}`;

  return 'Workflow path';
}
