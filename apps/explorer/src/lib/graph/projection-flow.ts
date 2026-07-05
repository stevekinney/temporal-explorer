import {
  switchClauseBody,
  type ExecutionOverlayDocument,
  type FlowNode,
  type RuntimeTraceDocument,
  type WorkflowDefinition,
} from '@temporal-explorer/schemas';

import type { ProjectionBuildContext, TemporalGraphEdge, TemporalGraphNode } from './projection';
import { createCommandGraphNode, isGraphCommand, type GraphCommand } from './projection-builders';

/**
 * Walks a Workflow's structured control-flow tree (`workflow.body.nodes`) into a
 * graph of nested region containers. Each `branch`/`loop`/`parallel`/`try` becomes a
 * container node whose children (command leaves, decision/join/terminal markers, and
 * further nested containers) carry its id as `parentId`, so ELK and Svelte Flow can
 * draw the regions as boxes. The flow inside a region mirrors `renderWorkflowMermaid`:
 * a decision diamond fans out to labeled clause arms that converge on a join dot,
 * loops draw a `repeat` back-edge, and `continue-as-new` loops back to the entry.
 */
type FlowContext = {
  nodes: TemporalGraphNode[];
  edges: TemporalGraphEdge[];
  counter: { value: number };
  startId: string;
  commandsById: Map<string, GraphCommand>;
  trace: RuntimeTraceDocument | undefined;
  overlay: ExecutionOverlayDocument | undefined;
  projection: ProjectionBuildContext;
};

export function buildControlFlowGraph(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument | undefined,
  overlay: ExecutionOverlayDocument | undefined,
  projection: ProjectionBuildContext,
  startId: string,
): { nodes: TemporalGraphNode[]; edges: TemporalGraphEdge[] } {
  const context: FlowContext = {
    nodes: [],
    edges: [],
    counter: { value: 0 },
    startId,
    commandsById: new Map(
      workflow.temporalCommands.filter(isGraphCommand).map((command) => [command.id, command]),
    ),
    trace,
    overlay,
    projection,
  };

  const exit = walkSequence(workflow.body.nodes, startId, undefined, context);

  if (exit !== undefined) {
    const complete = addStructural(context, 'terminal', 'complete', undefined);
    pushEdge(context, exit, complete, '');
  }

  return { nodes: context.nodes, edges: context.edges };
}

function nextId(context: FlowContext, prefix: string): string {
  context.counter.value += 1;
  return `flow:${prefix}:${context.counter.value}`;
}

function addStructural(
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

function pushEdge(
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

/** Walks a sequence of flow nodes from `entry`, returning the exit node id or undefined if a terminal ended the path. */
function walkSequence(
  nodes: FlowNode[],
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  entryLabel = '',
): string | undefined {
  let cursor: string | undefined = entry;
  let label = entryLabel;

  for (const node of nodes) {
    if (cursor === undefined) {
      break; // Unreachable: a terminal ended this path.
    }

    cursor = walkNode(node, cursor, parentId, context, label);
    label = '';
  }

  return cursor;
}

/** Renders one clause/branch arm into `join`; an empty arm draws a labeled edge straight to the join. */
function walkArm(
  body: FlowNode[],
  entry: string,
  join: string,
  label: string,
  parentId: string | undefined,
  context: FlowContext,
): void {
  if (body.length === 0) {
    pushEdge(context, entry, join, label);
    return;
  }

  const exit = walkSequence(body, entry, parentId, context, label);

  if (exit !== undefined) {
    pushEdge(context, exit, join, '');
  }
}

function walkNode(
  node: FlowNode,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
): string | undefined {
  switch (node.type) {
    case 'command':
      return walkCommand(node, entry, parentId, context, label);
    case 'terminal':
      return walkTerminal(node, entry, parentId, context, label);
    case 'branch':
      return walkBranch(node, entry, parentId, context, label);
    case 'loop':
      return walkLoop(node, entry, parentId, context, label);
    case 'parallel':
      return walkParallel(node, entry, parentId, context, label);
    case 'try':
      return walkTry(node, entry, parentId, context, label);
    default:
      return entry;
  }
}

function walkCommand(
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

function walkTerminal(
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
  return undefined;
}

function walkBranch(
  node: Extract<FlowNode, { type: 'branch' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
): string {
  const container = addStructural(context, 'branch-region', node.branchKind, parentId, true);
  const test = node.testCommandId ? context.commandsById.get(node.testCommandId) : undefined;
  const decision = addStructural(context, 'decision', test?.name ?? node.branchKind, container);
  pushEdge(context, entry, decision, label);

  const join = addStructural(context, 'join', '', container);

  for (const clause of node.clauses) {
    const body = switchClauseBody(clause.body, node.branchKind);
    walkArm(body, decision, join, clause.label, container, context);
  }

  const otherwise = switchClauseBody(node.otherwise ?? [], node.branchKind);
  walkArm(otherwise, decision, join, 'else', container, context);

  return join;
}

function walkLoop(
  node: Extract<FlowNode, { type: 'loop' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
): string {
  const container = addStructural(
    context,
    'loop-region',
    `loop (${node.loopKind})`,
    parentId,
    true,
  );
  const header = addStructural(context, 'decision', `loop (${node.loopKind})`, container);
  pushEdge(context, entry, header, label);

  // The forward edge into the body carries no label: the container header
  // already says "loop (...)", and for a single-node body the forward and
  // `repeat` back-edges connect the same node pair, so a forward label would
  // stack on top of `repeat` (the "eac repeat" overlap). Only the back-edge is labeled.
  const bodyExit = walkSequence(node.body, header, container, context);

  if (bodyExit !== undefined) {
    pushEdge(context, bodyExit, header, 'repeat', 'loop-back');
  }

  return header;
}

function walkParallel(
  node: Extract<FlowNode, { type: 'parallel' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
): string {
  const container = addStructural(
    context,
    'parallel-region',
    `Promise.${node.parallelKind}`,
    parentId,
    true,
  );
  const fork = addStructural(context, 'parallel-fork', `Promise.${node.parallelKind}`, container);
  pushEdge(context, entry, fork, label);

  const join = addStructural(context, 'join', '', container);

  if (node.cardinality === 'dynamic') {
    walkArm(node.templateBranch ?? [], fork, join, '×N', container, context);
    return join;
  }

  for (const branch of node.branches ?? []) {
    walkArm(branch, fork, join, '', container, context);
  }

  return join;
}

function walkTry(
  node: Extract<FlowNode, { type: 'try' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
): string | undefined {
  const container = addStructural(context, 'try-region', 'try', parentId, true);
  const bodyExit = walkSequence(node.body, entry, container, context, label);
  const converge = addStructural(context, 'join', '', container);

  if (bodyExit !== undefined) {
    pushEdge(context, bodyExit, converge, '');
  }

  if (node.handler) {
    const handlerExit = walkSequence(node.handler.body, entry, container, context, 'catch');

    if (handlerExit !== undefined) {
      pushEdge(context, handlerExit, converge, '');
    }
  }

  if (node.finalizer && node.finalizer.length > 0) {
    return walkSequence(node.finalizer, converge, container, context, 'finally');
  }

  return converge;
}
