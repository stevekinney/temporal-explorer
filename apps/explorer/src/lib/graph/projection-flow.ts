import {
  switchClauseBody,
  type ExecutionOverlayDocument,
  type FlowNode,
  type RuntimeTraceDocument,
  type WorkflowDefinition,
} from '@temporal-explorer/schemas';

import type { ProjectionBuildContext, TemporalGraphEdge, TemporalGraphNode } from './projection';
import { isGraphCommand } from './projection-builders';
import { addStructural, pushEdge, walkCommand, type FlowContext } from './projection-flow-core';
import { walkTerminalNode } from './projection-flow-terminal';

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
    loopTargets: [],
    finallyStack: [],
    duplicateCommandNodes: false,
  };

  const exit = walkSequence(workflow.body.nodes, startId, undefined, context);

  if (exit !== undefined) {
    const complete = addStructural(context, 'terminal', 'complete', undefined);
    pushEdge(context, exit, complete, '');
  }

  return { nodes: context.nodes, edges: context.edges };
}

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
      return walkTerminalNode(node, entry, parentId, context, label, (frame, finalizerEntry) =>
        walkSequence(frame.finalizer, finalizerEntry, frame.parentId, context, 'finally'),
      );
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
  const exit = addStructural(context, 'join', '', container);

  if (node.loopKind === 'do-while') {
    const bodyEntry = addStructural(context, 'join', '', container);
    pushEdge(context, entry, bodyEntry, label);
    context.loopTargets.push({
      label: node.label,
      breakTarget: exit,
      continueTarget: header,
    });
    const doBodyExit = walkSequence(node.body, bodyEntry, container, context);
    context.loopTargets.pop();

    if (doBodyExit !== undefined) {
      pushEdge(context, doBodyExit, header, '');
    }

    pushEdge(context, header, bodyEntry, 'repeat', 'loop-back');
    pushEdge(context, header, exit, 'done');
    return exit;
  }

  pushEdge(context, entry, header, label);
  pushEdge(context, header, exit, 'done');

  context.loopTargets.push({
    label: node.label,
    breakTarget: exit,
    continueTarget: header,
  });
  const bodyExit = walkSequence(node.body, header, container, context);
  context.loopTargets.pop();

  if (bodyExit !== undefined) {
    pushEdge(context, bodyExit, header, 'repeat', 'loop-back');
  }

  return exit;
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

function withFinallyFrame<T>(
  finalizer: FlowNode[] | undefined,
  parentId: string,
  context: FlowContext,
  callback: () => T,
): T {
  if (finalizer) {
    context.finallyStack.push({ finalizer, parentId });
  }

  const result = callback();

  if (finalizer) {
    context.finallyStack.pop();
  }

  return result;
}

function walkTryHandler(
  node: Extract<FlowNode, { type: 'try' }>,
  entry: string,
  converge: string,
  parentId: string,
  context: FlowContext,
): boolean {
  if (!node.handler) {
    return false;
  }

  const handlerExit = walkSequence(node.handler.body, entry, parentId, context, 'catch');

  if (handlerExit === undefined) {
    return false;
  }

  pushEdge(context, handlerExit, converge, '');
  return true;
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
  const bodyExit = withFinallyFrame(finalizer, container, context, () =>
    walkSequence(node.body, entry, container, context, label),
  );

  if (bodyExit !== undefined) {
    pushEdge(context, bodyExit, converge, '');
  }

  const handlerEntry = bodyExit ?? entry;
  const handlerHasNormalExit = withFinallyFrame(finalizer, container, context, () =>
    walkTryHandler(node, handlerEntry, converge, container, context),
  );
  const hasNormalExit = bodyExit !== undefined || handlerHasNormalExit;

  if (finalizer && hasNormalExit) {
    return walkSequence(finalizer, converge, container, context, 'finally');
  }

  return hasNormalExit ? converge : undefined;
}
