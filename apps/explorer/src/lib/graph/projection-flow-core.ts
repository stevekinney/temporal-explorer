import {
  type ExecutionOverlayDocument,
  type FlowNode,
  type RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

import type { ProjectionBuildContext, TemporalGraphEdge, TemporalGraphNode } from './projection';
import { createCommandGraphNode, type GraphCommand } from './projection-builders';

export type LoopTarget = {
  label: string | undefined;
  breakTarget: string;
  continueTarget: string;
};

export type FinallyFrame = {
  finalizer: FlowNode[];
  parentId: string | undefined;
};

/**
 * Shared state and the non-recursive leaves of the nested control-flow walk. The
 * recursive cluster (`walkSequence`/`walkNode` and the region-container walkers) lives
 * in `projection-flow`; keeping these leaves here breaks what would otherwise be an
 * import cycle, since `walkCommand`/`walkTerminal` never call back into the sequence walk.
 */
export type FlowContext = {
  nodes: TemporalGraphNode[];
  edges: TemporalGraphEdge[];
  counter: { value: number };
  startId: string;
  commandsById: Map<string, GraphCommand>;
  trace: RuntimeTraceDocument | undefined;
  overlay: ExecutionOverlayDocument | undefined;
  projection: ProjectionBuildContext;
  loopTargets: LoopTarget[];
  finallyStack: FinallyFrame[];
  duplicateCommandNodes: boolean;
};

function nextId(context: FlowContext, prefix: string): string {
  context.counter.value += 1;
  return `flow:${prefix}:${context.counter.value}`;
}

/** Appends a neutral structural marker (decision/join/fork/terminal/region) and returns its id. */
export function addStructural(
  context: FlowContext,
  kind: TemporalGraphNode['kind'],
  label: string,
  parentId: string | undefined,
  isContainer = false,
): string {
  const id = nextId(context, kind);
  context.nodes.push({
    id,
    label,
    kind,
    state: 'observed',
    source: undefined,
    sourceText: '',
    runtimeOperationIds: [],
    eventReferences: [],
    confidence: 'unknown',
    fallbackPosition: { x: 280 + context.counter.value * 48, y: 120 },
    parentId,
    isContainer,
  });
  return id;
}

/** Appends an edge, inheriting the target node's runtime state so edges color with their target. */
export function pushEdge(
  context: FlowContext,
  source: string,
  target: string,
  label: string,
  variant?: 'loop-back',
): void {
  context.counter.value += 1;
  const targetNode = context.nodes.find((node) => node.id === target);
  context.edges.push({
    id: `edge:${context.counter.value}:${source}->${target}`,
    source,
    target,
    label,
    state: targetNode?.state ?? 'observed',
    runtimeOperationIds: targetNode?.runtimeOperationIds ?? [],
    eventReferences: targetNode?.eventReferences ?? [],
    ...(variant ? { variant } : {}),
  });
}

/** Renders a command leaf, linking it from `entry`; returns the command id, or `entry` if not flow-relevant. */
export function walkCommand(
  node: Extract<FlowNode, { type: 'command' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
): string {
  const command = context.commandsById.get(node.commandId);

  if (!command) {
    return entry; // Not a flow-relevant command (e.g. a branch test); keep the cursor.
  }

  const graphNode = createCommandGraphNode(
    command,
    { x: 280 + context.counter.value * 48, y: 120 },
    context.trace,
    context.overlay,
    context.projection,
  );
  graphNode.parentId = parentId;
  if (context.duplicateCommandNodes) {
    graphNode.id = `${command.id}:flow:${context.counter.value + 1}`;
  }
  context.nodes.push(graphNode);
  pushEdge(context, entry, graphNode.id, label);

  return graphNode.id;
}
