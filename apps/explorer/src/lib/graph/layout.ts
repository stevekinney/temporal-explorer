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
  // Absolute top-left of every node, needed to place edges: ELK returns node child
  // coordinates relative to their parent, so absolute = parent absolute + local.
  const absolute = new Map<string, LayoutPoint>();

  const collect = (elkNode: ElkNode, offsetX: number, offsetY: number): void => {
    const x = elkNode.x ?? 0;
    const y = elkNode.y ?? 0;
    positions[elkNode.id] = { x, y, width: elkNode.width ?? 256, height: elkNode.height ?? 132 };
    absolute.set(elkNode.id, { x: offsetX + x, y: offsetY + y });

    for (const child of elkNode.children ?? []) {
      collect(child, offsetX + x, offsetY + y);
    }
  };

  for (const child of layout.children ?? []) {
    collect(child, 0, 0);
  }

  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  return { positions, edgeRoutes: extractEdgeRoutes(layout.edges, parentOf, absolute) };
}

type ParentMap = Map<string, string | undefined>;

/**
 * Reads ELK's routing sections into {@link EdgeRoute}s. ELK returns each edge's
 * coordinates relative to the edge's container — the lowest common ancestor of its
 * source and target — so a route inside a region container is offset by that
 * container's absolute position to land in Svelte Flow's absolute coordinate space.
 */
function extractEdgeRoutes(
  elkEdges: ElkNode['edges'],
  parentOf: ParentMap,
  absolute: Map<string, LayoutPoint>,
): EdgeRoutes {
  const edgeRoutes: EdgeRoutes = {};

  for (const elkEdge of elkEdges ?? []) {
    const route = buildEdgeRoute(elkEdge, parentOf, absolute);
    if (route) edgeRoutes[elkEdge.id] = route;
  }

  return edgeRoutes;
}

/** Builds one edge's route, shifting ELK's container-relative section into absolute space. */
function buildEdgeRoute(
  elkEdge: NonNullable<ElkNode['edges']>[number],
  parentOf: ParentMap,
  absolute: Map<string, LayoutPoint>,
): EdgeRoute | undefined {
  const section = elkEdge.sections?.[0];
  if (!section) return undefined;

  const container = edgeContainer(elkEdge.sources?.[0], elkEdge.targets?.[0], parentOf);
  const origin = (container && absolute.get(container)) || { x: 0, y: 0 };
  const shift = (point: LayoutPoint): LayoutPoint => ({
    x: point.x + origin.x,
    y: point.y + origin.y,
  });

  return {
    points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(shift),
    ...labelCenter(elkEdge.labels?.[0], origin),
  };
}

/** The lowest common ancestor container of an edge's endpoints, or undefined for the root. */
function edgeContainer(
  source: string | undefined,
  target: string | undefined,
  parentOf: ParentMap,
): string | undefined {
  if (!source || !target) return undefined;

  const sourceAncestors = new Set<string>();
  for (let node = parentOf.get(source); node; node = parentOf.get(node)) sourceAncestors.add(node);

  for (let node = parentOf.get(target); node; node = parentOf.get(node)) {
    if (sourceAncestors.has(node)) return node;
  }

  return undefined;
}

/** Center of an ELK edge label, shifted from its container-relative box into absolute space. */
function labelCenter(
  label: ElkLabel | undefined,
  origin: LayoutPoint,
): Pick<EdgeRoute, 'labelX' | 'labelY'> {
  if (label?.x === undefined || label.y === undefined) return {};
  return {
    labelX: origin.x + label.x + (label.width ?? 0) / 2,
    labelY: origin.y + label.y + (label.height ?? 0) / 2,
  };
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
