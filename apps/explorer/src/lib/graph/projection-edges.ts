import type { TemporalGraphEdge, TemporalGraphNode } from './projection';

/**
 * Assembles the full graph edge set: the flow edges across the command nodes
 * (either the nested control-flow walk or the flat sequential chain), plus a
 * `signal`/`query`/`update` edge from each message-surface node into the workflow
 * node, and a `scope` edge from each cancellation scope node into the workflow node.
 */
export function createGraphEdges(
  workflowNode: TemporalGraphNode,
  commandEdges: TemporalGraphEdge[],
  messageSurfaceNodes: TemporalGraphNode[],
  scopeNodes: TemporalGraphNode[],
): TemporalGraphEdge[] {
  return [
    ...commandEdges,
    ...createNodeToWorkflowEdges(workflowNode, messageSurfaceNodes, (node) => node.kind),
    ...createNodeToWorkflowEdges(workflowNode, scopeNodes, () => 'scope'),
  ];
}

/** Builds a flat sequential chain across command nodes (in staticOrder), used when a Workflow has no structured `body.nodes`. */
export function createSequentialGraphEdges(
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
  'nexus-operation': 'Nexus operation',
  'search-attribute': 'Search attribute',
  patch: 'Patch',
  dynamic: 'Dynamic',
};

function sequentialEdgeLabel(kind: TemporalGraphNode['kind'], occurrence: number): string {
  if (kind === 'continue-as-new') return 'Continue as new';

  const prefix = sequentialEdgeLabelPrefixes[kind];

  return prefix ? `${prefix} ${occurrence}` : 'Workflow path';
}
