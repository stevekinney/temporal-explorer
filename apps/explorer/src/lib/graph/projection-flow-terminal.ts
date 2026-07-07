import type { FlowNode } from '@temporal-explorer/schemas';

import { createCommandGraphNode } from './projection-builders';
import {
  addStructural,
  pushEdge,
  type FinallyFrame,
  type FlowContext,
  type LoopTarget,
  type TerminalTarget,
} from './projection-flow-core';

function matchingLoopTarget(
  terminal: Extract<FlowNode, { type: 'terminal' }>,
  context: FlowContext,
): LoopTarget | undefined {
  return context.loopTargets
    .toReversed()
    .find((target) => terminal.label === undefined || terminal.label === target.label);
}

function terminalTarget(
  node: Extract<FlowNode, { type: 'terminal' }>,
  context: FlowContext,
): TerminalTarget | undefined {
  if (node.terminalKind === 'break') {
    const target =
      node.label === undefined
        ? context.breakTargets.at(-1)
        : context.breakTargets.toReversed().find((candidate) => candidate.label === node.label);

    return target ? { id: target.breakTarget, finallyDepth: target.finallyDepth } : undefined;
  }

  if (node.terminalKind === 'continue') {
    const target = matchingLoopTarget(node, context);

    return target ? { id: target.continueTarget, finallyDepth: target.finallyDepth } : undefined;
  }

  return undefined;
}

function routeAbruptExit(
  from: string,
  target: TerminalTarget | undefined,
  context: FlowContext,
  renderFinalizer: (frame: FinallyFrame, entry: string) => string | undefined,
  targetLabel = '',
): void {
  let cursor: string | undefined = from;
  const targetFinallyDepth = target?.finallyDepth ?? 0;

  for (let index = context.finallyStack.length - 1; index >= targetFinallyDepth; index -= 1) {
    const frame = context.finallyStack[index];

    if (!frame || cursor === undefined) {
      return;
    }

    const previousFinallyStack = context.finallyStack;
    const previousDuplicateCommandNodes = context.duplicateCommandNodes;
    const previousDuplicateCommandPath = context.duplicateCommandPath;
    context.abruptPathCounter.value += 1;
    context.finallyStack = previousFinallyStack.slice(0, index);
    context.duplicateCommandNodes = true;
    context.duplicateCommandPath = `finally-${index}-${context.abruptPathCounter.value}`;
    cursor = renderFinalizer(frame, cursor);
    context.finallyStack = previousFinallyStack;
    context.duplicateCommandNodes = previousDuplicateCommandNodes;
    context.duplicateCommandPath = previousDuplicateCommandPath;
  }

  if (cursor !== undefined && target !== undefined) {
    pushEdge(context, cursor, target.id, targetLabel);
  }
}

export function walkTerminalNode(
  node: Extract<FlowNode, { type: 'terminal' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
  renderFinalizer: (frame: FinallyFrame, entry: string) => string | undefined,
): undefined {
  if (node.terminalKind === 'continue-as-new') {
    const command = node.commandId ? context.commandsById.get(node.commandId) : undefined;

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
      routeAbruptExit(
        command.id,
        { id: context.startId, finallyDepth: 0 },
        context,
        renderFinalizer,
        'loop',
      );
      return undefined;
    }

    const id = addStructural(context, 'terminal', 'continue as new', parentId);
    pushEdge(context, entry, id, label);
    routeAbruptExit(id, { id: context.startId, finallyDepth: 0 }, context, renderFinalizer, 'loop');
    return undefined;
  }

  const display = node.label ? `${node.terminalKind} ${node.label}` : node.terminalKind;
  const id = addStructural(context, 'terminal', display, parentId);
  pushEdge(context, entry, id, label);
  routeAbruptExit(id, terminalTarget(node, context), context, renderFinalizer);

  return undefined;
}
