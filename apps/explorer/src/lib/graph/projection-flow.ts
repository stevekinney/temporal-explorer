import {
  switchClauseBody,
  type ExecutionOverlayDocument,
  type FlowNode,
  type RuntimeTraceDocument,
  type WorkflowDefinition,
} from '@temporal-explorer/schemas';

import type { ProjectionBuildContext, TemporalGraphEdge, TemporalGraphNode } from './projection';
import { isGraphCommand } from './projection-builders';
import {
  addStructural,
  pushEdge,
  walkCommand,
  walkTerminal,
  type FlowContext,
} from './projection-flow-core';

/**
 * Walks a Workflow's structured control-flow tree (`workflow.body.nodes`) into a
 * graph of nested region containers. Each `branch`/`loop`/`parallel`/`try` becomes a
 * container node whose children (command leaves, decision/join/terminal markers, and
 * further nested containers) carry its id as `parentId`, so ELK and Svelte Flow can
 * draw the regions as boxes. The flow inside a region mirrors `renderWorkflowMermaid`:
 * a decision diamond fans out to labeled clause arms that converge on a join dot,
 * loops draw a `repeat` back-edge, and `continue-as-new` loops back to the entry.
 *
 * The shared context type and the non-recursive leaves (`walkCommand`/`walkTerminal`
 * and the `addStructural`/`pushEdge` helpers) live in `projection-flow-core`.
 */
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
    finallyTarget: undefined,
  };

  const exit = walkSequence(workflow.body.nodes, startId, undefined, context);

  if (exit !== undefined) {
    const complete = addStructural(context, 'terminal', 'complete', undefined);
    pushEdge(context, exit, complete, '');
  }

  return { nodes: context.nodes, edges: context.edges };
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
  const converge = addStructural(context, 'join', '', container);
  const finalizer = node.finalizer && node.finalizer.length > 0 ? node.finalizer : undefined;

  // While a `finally` block exists, terminals inside the try/catch (return/throw/…)
  // must route through `converge` so the finalizer runs on every exit. Save/restore
  // makes this nesting-safe for a try nested inside another try's finalizer scope.
  const previousFinallyTarget = context.finallyTarget;
  if (finalizer) {
    context.finallyTarget = converge;
  }

  const bodyExit = walkSequence(node.body, entry, container, context, label);

  if (bodyExit !== undefined) {
    pushEdge(context, bodyExit, converge, '');
  }

  if (node.handler) {
    const handlerExit = walkSequence(node.handler.body, entry, container, context, 'catch');

    if (handlerExit !== undefined) {
      pushEdge(context, handlerExit, converge, '');
    }
  }

  context.finallyTarget = previousFinallyTarget;

  if (finalizer) {
    return walkSequence(finalizer, converge, container, context, 'finally');
  }

  return converge;
}
