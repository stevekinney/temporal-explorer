import type { TemporalGraphEdge, TemporalGraphNode } from './projection';

/**
 * Builds the graph edges: a sequential chain across the command nodes (in
 * staticOrder) so the flow view shows waits between them, plus a `signal`/`query`/
 * `update` edge from each message-surface node into the workflow node, and a `scope`
 * edge from each cancellation scope node into the workflow node.
 */
export function createGraphEdges(
  workflowNode: TemporalGraphNode,
  commandNodes: TemporalGraphNode[],
  messageSurfaceNodes: TemporalGraphNode[],
  scopeNodes: TemporalGraphNode[],
): TemporalGraphEdge[] {
  return [
    ...createSequentialGraphEdges(workflowNode, commandNodes),
    ...createNodeToWorkflowEdges(workflowNode, messageSurfaceNodes, (node) => node.kind),
    ...createNodeToWorkflowEdges(workflowNode, scopeNodes, () => 'scope'),
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

/** Builds a directed edge from each node into the workflow node, labeled via `labelForNode`. */
function createNodeToWorkflowEdges(
  workflowNode: TemporalGraphNode,
  nodes: TemporalGraphNode[],
  labelForNode: (node: TemporalGraphNode) => string,
): TemporalGraphEdge[] {
  return nodes.map((node) => ({
    id: `edge:${node.id}->${workflowNode.id}`,
    source: node.id,
    target: workflowNode.id,
    label: labelForNode(node),
    state: node.state,
    runtimeOperationIds: node.runtimeOperationIds,
    eventReferences: node.eventReferences,
  }));
}

const sequentialEdgeLabelPrefixes: Partial<Record<TemporalGraphNode['kind'], string>> = {
  activity: 'Activity',
  timer: 'Timer',
  condition: 'Condition',
  'child-workflow': 'Child workflow',
  'external-workflow': 'External workflow',
  patch: 'Patch',
  dynamic: 'Dynamic',
};

function sequentialEdgeLabel(kind: TemporalGraphNode['kind'], occurrence: number): string {
  if (kind === 'continue-as-new') return 'Continue as new';

  const prefix = sequentialEdgeLabelPrefixes[kind];

  return prefix ? `${prefix} ${occurrence}` : 'Workflow path';
}
