import type { ELK as ElkInstance, ElkNode } from 'elkjs/lib/elk-api.js';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';

import type { TemporalGraphEdge, TemporalGraphNode } from './projection';

export type LayoutPositions = Record<string, { x: number; y: number }>;
export type LayoutStatus = 'idle' | 'running' | 'ready' | 'failed';

let elk: ElkInstance | undefined;

export async function layoutGraph(
  nodes: TemporalGraphNode[],
  edges: TemporalGraphEdge[],
): Promise<LayoutPositions> {
  const graph: ElkNode = {
    id: 'temporal-explorer-flow',
    children: nodes.map((node) => ({
      id: node.id,
      width: 256,
      height: 132,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };
  const layout = await getElk().layout(graph);

  return Object.fromEntries(
    (layout.children ?? []).map((node) => [
      node.id,
      {
        x: node.x ?? 0,
        y: node.y ?? 0,
      },
    ]),
  );
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
      'elk.layered.spacing.nodeNodeBetweenLayers': '96',
      'elk.spacing.nodeNode': '48',
    },
  });

  return elk;
}
