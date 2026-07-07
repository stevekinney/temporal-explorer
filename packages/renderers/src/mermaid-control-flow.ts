import { switchClauseBody, type FlowNode } from '@temporal-explorer/schemas';

import {
  nextNodeId,
  pushEdge,
  routeAbruptExit,
  terminalTarget,
  type RenderContext,
} from './mermaid-control-context';
import { flowCommandKinds, shapeForKind, toMermaidId, toMermaidLabel } from './mermaid-format';
import { commandDisplayName } from './shared';

export function renderSequence(
  nodes: FlowNode[],
  entry: string,
  context: RenderContext,
  entryLabel?: string,
): string | undefined {
  let cursor: string | undefined = entry;
  let pendingLabel = entryLabel;

  for (const node of nodes) {
    if (cursor === undefined) {
      break;
    }

    cursor = renderNode(node, cursor, context, pendingLabel);
    pendingLabel = undefined;
  }

  return cursor;
}

function renderArmInto(
  body: FlowNode[],
  entry: string,
  join: string,
  label: string | undefined,
  context: RenderContext,
): void {
  if (body.length === 0) {
    pushEdge(context, entry, join, label);
    return;
  }

  const exit = renderSequence(body, entry, context, label);

  if (exit !== undefined) {
    pushEdge(context, exit, join);
  }
}

function renderCommandNode(
  node: Extract<FlowNode, { type: 'command' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string {
  const command = context.commandsById.get(node.commandId);
  const id = toMermaidId(`${node.id}${context.nodeIdSuffix}`);
  const kind = command?.kind ?? 'activity';
  const name = toMermaidLabel(command ? commandDisplayName(command) : node.commandId);
  const suffix = command?.cardinality === 'fan-out' ? ' ×N' : '';

  context.nodes.push(shapeForKind(kind, id, `${name}${suffix}`));
  pushEdge(context, entry, id, label);

  return id;
}

function renderTerminalNode(
  node: Extract<FlowNode, { type: 'terminal' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): undefined {
  const id = toMermaidId(`${node.id}${context.nodeIdSuffix}`);

  if (node.terminalKind === 'continue-as-new') {
    const command = node.commandId ? context.commandsById.get(node.commandId) : undefined;
    context.nodes.push(`  ${id}[/"continue as new: ${toMermaidLabel(command?.name ?? '')}"/]`);
    pushEdge(context, entry, id, label);
    routeAbruptExit(
      id,
      context.startId,
      context,
      (finalizer, finalizerEntry) => renderSequence(finalizer, finalizerEntry, context, 'finally'),
      'loop',
    );
    return undefined;
  }

  const terminalLabel = node.label ? `${node.terminalKind} ${node.label}` : node.terminalKind;
  context.nodes.push(`  ${id}(["${toMermaidLabel(terminalLabel)}"])`);
  pushEdge(context, entry, id, label);
  routeAbruptExit(id, terminalTarget(node, context), context, (finalizer, finalizerEntry) =>
    renderSequence(finalizer, finalizerEntry, context, 'finally'),
  );

  return undefined;
}

function renderBranchNode(
  node: Extract<FlowNode, { type: 'branch' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string {
  const decision = toMermaidId(`${node.id}${context.nodeIdSuffix}`);
  const testCommand = node.testCommandId ? context.commandsById.get(node.testCommandId) : undefined;
  const decisionLabel = testCommand?.name ?? (node.branchKind === 'switch' ? 'switch' : 'if');
  context.nodes.push(`  ${decision}{"${toMermaidLabel(decisionLabel)}"}`);
  pushEdge(context, entry, decision, label);

  const join = nextNodeId(context);
  context.nodes.push(`  ${join}(( ))`);

  for (const clause of node.clauses) {
    renderArmInto(
      switchClauseBody(clause.body, node.branchKind),
      decision,
      join,
      clause.label,
      context,
    );
  }

  renderArmInto(
    switchClauseBody(node.otherwise ?? [], node.branchKind),
    decision,
    join,
    'else',
    context,
  );

  return join;
}

function renderLoopNode(
  node: Extract<FlowNode, { type: 'loop' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string {
  const loop = toMermaidId(`${node.id}${context.nodeIdSuffix}`);
  context.nodes.push(`  ${loop}{"loop (${node.loopKind})"}`);
  const exit = nextNodeId(context);
  context.nodes.push(`  ${exit}(( ))`);

  const doWhile = node.loopKind === 'do-while';
  const bodyEntry = doWhile ? nextNodeId(context) : loop;
  if (doWhile) context.nodes.push(`  ${bodyEntry}(( ))`);

  pushEdge(context, entry, bodyEntry, label);
  context.loopTargets.push({ label: node.label, breakTarget: exit, continueTarget: loop });
  const bodyExit = renderSequence(node.body, bodyEntry, context, 'each');
  context.loopTargets.pop();

  if (bodyExit !== undefined) pushEdge(context, bodyExit, loop, doWhile ? undefined : 'repeat');
  if (doWhile) pushEdge(context, loop, bodyEntry, 'repeat');
  pushEdge(context, loop, exit, 'done');

  return exit;
}

function renderParallelNode(
  node: Extract<FlowNode, { type: 'parallel' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string {
  const fork = toMermaidId(`${node.id}${context.nodeIdSuffix}`);
  context.nodes.push(`  ${fork}{{"Promise.${node.parallelKind}"}}`);
  pushEdge(context, entry, fork, label);

  const join = nextNodeId(context);
  context.nodes.push(`  ${join}(( ))`);

  if (node.cardinality === 'dynamic') {
    renderArmInto(node.templateBranch ?? [], fork, join, '×N', context);
    return join;
  }

  for (const branch of node.branches ?? []) {
    renderArmInto(branch, fork, join, undefined, context);
  }

  return join;
}

function withFinallyFrame<T>(
  finalizer: FlowNode[] | undefined,
  context: RenderContext,
  callback: () => T,
): T {
  if (finalizer) context.finallyStack.push({ finalizer });
  const result = callback();
  if (finalizer) context.finallyStack.pop();
  return result;
}

function renderTryHandler(
  node: Extract<FlowNode, { type: 'try' }>,
  entry: string,
  converge: string,
  context: RenderContext,
): boolean {
  if (!node.handler) {
    return false;
  }

  const handlerExit = renderSequence(node.handler.body, entry, context, 'catch');
  if (handlerExit === undefined) {
    return false;
  }

  pushEdge(context, handlerExit, converge);
  return true;
}

function renderTryNode(
  node: Extract<FlowNode, { type: 'try' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string | undefined {
  const converge = nextNodeId(context);
  context.nodes.push(`  ${converge}(( ))`);
  const finalizer = node.finalizer && node.finalizer.length > 0 ? node.finalizer : undefined;
  const bodyExit = withFinallyFrame(finalizer, context, () =>
    renderSequence(node.body, entry, context, label),
  );

  if (bodyExit !== undefined) {
    pushEdge(context, bodyExit, converge);
  }

  const handlerEntry = bodyExit ?? entry;
  const handlerHasNormalExit = withFinallyFrame(finalizer, context, () =>
    renderTryHandler(node, handlerEntry, converge, context),
  );
  const hasNormalExit = bodyExit !== undefined || handlerHasNormalExit;

  if (finalizer && hasNormalExit) {
    return renderSequence(finalizer, converge, context, 'finally');
  }

  return hasNormalExit ? converge : undefined;
}

function renderNode(
  node: FlowNode,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string | undefined {
  switch (node.type) {
    case 'command':
      return renderCommandNode(node, entry, context, label);
    case 'terminal':
      return renderTerminalNode(node, entry, context, label);
    case 'branch':
      return renderBranchNode(node, entry, context, label);
    case 'loop':
      return renderLoopNode(node, entry, context, label);
    case 'parallel':
      return renderParallelNode(node, entry, context, label);
    case 'try':
      return renderTryNode(node, entry, context, label);
    default:
      return undefined;
  }
}

export { flowCommandKinds, shapeForKind, toMermaidId, toMermaidLabel };
