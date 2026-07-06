import {
  type ExecutionOverlayDocument,
  type FlowNode,
  type RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

import type { ProjectionBuildContext, TemporalGraphEdge, TemporalGraphNode } from './projection';
import { createCommandGraphNode, type GraphCommand } from './projection-builders';

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
  // The join node of the nearest enclosing `try` that has a `finalizer`. While set,
  // a terminal (return/throw/…) inside the try/catch routes here instead of dead-ending,
  // because `finally` runs on every exit from the try before the workflow continues.
  finallyTarget: string | undefined;
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
  context.nodes.push(graphNode);
  pushEdge(context, entry, command.id, label);

  return command.id;
}

/** Renders a terminal leaf: `continue-as-new` loops back to entry; others dead-end unless a `finally` routes them. */
export function walkTerminal(
  node: Extract<FlowNode, { type: 'terminal' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
): undefined {
  if (node.terminalKind === 'continue-as-new') {
    const command = node.commandId ? context.commandsById.get(node.commandId) : undefined;

    // Keep the continue-as-new command's id and runtime state so the overlay/timeline
    // still resolve to a visible node, while adding the `loop` back-edge to the entry.
    if (command) {
      const graphNode = createCommandGraphNode(
        command,
        { x: 280 + context.counter.value * 48, y: 120 },
        context.trace,
        context.overlay,
        context.projection,
      );
      graphNode.parentId = parentId;
      context.nodes.push(graphNode);
      pushEdge(context, entry, command.id, label);
      pushEdge(context, command.id, context.startId, 'loop', 'loop-back');
      return undefined;
    }

    const id = addStructural(context, 'terminal', 'continue as new', parentId);
    pushEdge(context, entry, id, label);
    pushEdge(context, id, context.startId, 'loop', 'loop-back');
    return undefined;
  }

  const id = addStructural(context, 'terminal', node.terminalKind, parentId);
  pushEdge(context, entry, id, label);

  // Inside a try that has a `finally`, an abrupt exit (return/throw/break/continue)
  // still runs the finalizer before leaving, so route the terminal into that join
  // instead of dead-ending it as a detached node.
  if (context.finallyTarget !== undefined) {
    pushEdge(context, id, context.finallyTarget, '');
  }

  return undefined;
}
