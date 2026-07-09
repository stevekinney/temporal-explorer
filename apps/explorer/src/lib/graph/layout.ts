import type { ELK as ElkInstance, ElkNode } from 'elkjs/lib/elk-api.js';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';

import type { TemporalGraphEdge, TemporalGraphNode } from './projection';

export type LayoutPosition = { x: number; y: number; width: number; height: number };
export type LayoutPositions = Record<string, LayoutPosition>;
export type LayoutStatus = 'idle' | 'running' | 'ready' | 'failed';
export type GraphLayout = { positions: LayoutPositions };

let elk: ElkInstance | undefined;

/** Fixed sizes fed to ELK so the computed layout matches the rendered node dimensions. */
function nodeSize(node: TemporalGraphNode): { width: number; height: number } {
  if (node.kind === 'decision' || node.kind === 'parallel-fork') return { width: 180, height: 64 };
  if (node.kind === 'join') return { width: 44, height: 44 };
  if (node.kind === 'terminal') return { width: 132, height: 48 };

  return { width: 220, height: 112 };
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
  const shouldWrap = nodes.filter((node) => !node.isContainer).length > 24;

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
    ...(shouldWrap
      ? {
          layoutOptions: {
            'elk.aspectRatio': '1.65',
            'elk.layered.wrapping.strategy': 'SINGLE_EDGE',
            'elk.layered.wrapping.correctionFactor': '1',
            'elk.layered.wrapping.additionalEdgeSpacing': '44',
          },
        }
      : {}),
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
    const x = elkNode.x ?? 0;
    const y = elkNode.y ?? 0;
    positions[elkNode.id] = { x, y, width: elkNode.width ?? 256, height: elkNode.height ?? 132 };

    for (const child of elkNode.children ?? []) {
      collect(child);
    }
  };

  for (const child of layout.children ?? []) {
    collect(child);
  }

  return { positions };
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
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.spacing.nodeNode': '34',
      // Center-place edge labels and give them breathing room so they never sit on a node.
      'elk.edgeLabels.placement': 'CENTER',
      'elk.spacing.edgeLabel': '8',
      'elk.layered.spacing.edgeLabelSpacing': '8',
    },
  });

  return elk;
}
