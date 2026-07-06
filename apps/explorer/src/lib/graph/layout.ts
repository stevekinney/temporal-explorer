import type { ELK as ElkInstance, ElkLabel, ElkNode } from 'elkjs/lib/elk-api.js';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';

import type { TemporalGraphEdge, TemporalGraphNode } from './projection';

export type LayoutPosition = { x: number; y: number; width: number; height: number };
export type LayoutPositions = Record<string, LayoutPosition>;
export type LayoutStatus = 'idle' | 'running' | 'ready' | 'failed';

export type LayoutPoint = { x: number; y: number };
/**
 * ELK's computed orthogonal route for an edge: the polyline waypoints from
 * source to target (in absolute flow coordinates) plus the center of its label.
 * Rendering these instead of letting Svelte Flow re-route keeps edges inside the
 * region containers ELK routed them around.
 */
export type EdgeRoute = { points: LayoutPoint[]; labelX?: number; labelY?: number };
export type EdgeRoutes = Record<string, EdgeRoute>;
export type GraphLayout = { positions: LayoutPositions; edgeRoutes: EdgeRoutes };

let elk: ElkInstance | undefined;

/** Fixed sizes fed to ELK so the computed layout matches the rendered node dimensions. */
function nodeSize(node: TemporalGraphNode): { width: number; height: number } {
  if (node.kind === 'decision' || node.kind === 'parallel-fork') return { width: 208, height: 76 };
  if (node.kind === 'join') return { width: 44, height: 44 };
  if (node.kind === 'terminal') return { width: 168, height: 60 };

  return { width: 256, height: 132 };
}

/**
 * Estimated size of a rendered edge label. ELK reserves inter-layer space for
 * center-placed edge labels only when they carry dimensions, so without this
 * the layered layout packs decision/arm nodes tight enough that a label like
 * `input.iteration + 1 < input.maxIterations` overlaps both boxes.
 */
function edgeLabelSize(label: string): { width: number; height: number } {
  return { width: Math.ceil(label.length * 6.6) + 16, height: 22 };
}

/**
 * Lays out the graph with ELK, nesting each region container's children so the
 * containers are drawn as sized boxes. Region containers become ELK subgraphs
 * (`children`), and `elk.hierarchyHandling: INCLUDE_CHILDREN` lets edges cross
 * container boundaries. Child coordinates come back relative to their parent —
 * exactly what Svelte Flow expects for a node with a `parentId`.
 */
export async function layoutGraph(
  nodes: TemporalGraphNode[],
  edges: TemporalGraphEdge[],
): Promise<GraphLayout> {
  const childrenByParent = new Map<string | undefined, TemporalGraphNode[]>();

  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }

  const toElkNode = (node: TemporalGraphNode): ElkNode => {
    const children = childrenByParent.get(node.id) ?? [];

    if (node.isContainer) {
      return {
        id: node.id,
        // Extra top padding leaves room for the container's header label.
        layoutOptions: { 'elk.padding': '[top=54,left=22,bottom=22,right=22]' },
        children: children.map(toElkNode),
      };
    }

    return { id: node.id, ...nodeSize(node) };
  };

  const graph: ElkNode = {
    id: 'temporal-explorer-flow',
    children: (childrenByParent.get(undefined) ?? []).map(toElkNode),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
      // Labelled edges get a sized label so ELK reserves room for it between layers.
      ...(edge.label ? { labels: [{ text: edge.label, ...edgeLabelSize(edge.label) }] } : {}),
    })),
  };
  const layout = await getElk().layout(graph);
  const positions: LayoutPositions = {};

  const collect = (elkNode: ElkNode): void => {
    positions[elkNode.id] = {
      x: elkNode.x ?? 0,
      y: elkNode.y ?? 0,
      width: elkNode.width ?? 256,
      height: elkNode.height ?? 132,
    };

    for (const child of elkNode.children ?? []) {
      collect(child);
    }
  };

  for (const child of layout.children ?? []) {
    collect(child);
  }

  return { positions, edgeRoutes: extractEdgeRoutes(layout.edges) };
}

/**
 * Reads ELK's routing sections into {@link EdgeRoute}s. Edges are declared on the
 * root graph, so their sections come back in absolute flow coordinates — exactly
 * what Svelte Flow's edge renderer expects — and each label's center is derived
 * from its absolute top-left box.
 */
function extractEdgeRoutes(elkEdges: ElkNode['edges']): EdgeRoutes {
  const edgeRoutes: EdgeRoutes = {};

  for (const elkEdge of elkEdges ?? []) {
    const section = elkEdge.sections?.[0];
    if (!section) continue;

    edgeRoutes[elkEdge.id] = {
      points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
      ...labelCenter(elkEdge.labels?.[0]),
    };
  }

  return edgeRoutes;
}

/** Center point of an ELK edge label, derived from its absolute top-left box. */
function labelCenter(label: ElkLabel | undefined): Pick<EdgeRoute, 'labelX' | 'labelY'> {
  if (label?.x === undefined || label.y === undefined) return {};
  return { labelX: label.x + (label.width ?? 0) / 2, labelY: label.y + (label.height ?? 0) / 2 };
}

export function terminateGraphLayoutWorker(): void {
  elk?.terminateWorker();
  elk = undefined;
}

function getElk(): ElkInstance {
  elk ??= new ELK({
    workerUrl: elkWorkerUrl,
    defaultLayoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      // GREEDY (the default) flips loop-back edges; DEPTH_FIRST keeps `repeat` edges pointing back.
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.spacing.nodeNode': '48',
      // Center-place edge labels and give them breathing room so they never sit on a node.
      'elk.edgeLabels.placement': 'CENTER',
      'elk.spacing.edgeLabel': '8',
      'elk.layered.spacing.edgeLabelSpacing': '8',
    },
  });

  return elk;
}
