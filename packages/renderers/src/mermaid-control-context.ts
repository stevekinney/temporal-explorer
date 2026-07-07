import type { FlowNode, TemporalCommand } from '@temporal-explorer/schemas';

import { toMermaidLabel } from './mermaid-format';

export type LoopTarget = {
  label: string | undefined;
  breakTarget: string;
  continueTarget: string;
  finallyDepth: number;
};

export type BreakTarget = {
  label: string | undefined;
  breakTarget: string;
  finallyDepth: number;
};

export type TerminalTarget = {
  id: string;
  finallyDepth: number;
};

export type RenderContext = {
  nodes: string[];
  edges: string[];
  counter: { value: number };
  startId: string;
  commandsById: Map<string, TemporalCommand>;
  loopTargets: LoopTarget[];
  breakTargets: BreakTarget[];
  finallyStack: { finalizer: FlowNode[] }[];
  nodeIdSuffix: string;
  abruptPathCounter: { value: number };
};

export function nextNodeId(context: RenderContext): string {
  context.counter.value += 1;
  return `n${context.counter.value}`;
}

export function pushEdge(context: RenderContext, from: string, to: string, label?: string): void {
  context.edges.push(
    label ? `  ${from} -->|"${toMermaidLabel(label)}"| ${to}` : `  ${from} --> ${to}`,
  );
}

function matchingLoopTarget(
  node: Extract<FlowNode, { type: 'terminal' }>,
  context: RenderContext,
): LoopTarget | undefined {
  return context.loopTargets
    .toReversed()
    .find((target) => node.label === undefined || node.label === target.label);
}

function matchingBreakTarget(
  node: Extract<FlowNode, { type: 'terminal' }>,
  context: RenderContext,
): BreakTarget | undefined {
  if (node.label === undefined) {
    return context.breakTargets.at(-1);
  }

  return context.breakTargets.toReversed().find((target) => target.label === node.label);
}

export function terminalTarget(
  node: Extract<FlowNode, { type: 'terminal' }>,
  context: RenderContext,
): TerminalTarget | undefined {
  if (node.terminalKind === 'break') {
    const target = matchingBreakTarget(node, context);

    return target ? { id: target.breakTarget, finallyDepth: target.finallyDepth } : undefined;
  }

  if (node.terminalKind === 'continue') {
    const target = matchingLoopTarget(node, context);

    return target ? { id: target.continueTarget, finallyDepth: target.finallyDepth } : undefined;
  }

  return undefined;
}

export function routeAbruptExit(
  from: string,
  target: TerminalTarget | undefined,
  context: RenderContext,
  renderFinalizer: (finalizer: FlowNode[], entry: string) => string | undefined,
  targetLabel?: string,
): void {
  let cursor: string | undefined = from;
  const targetFinallyDepth = target?.finallyDepth ?? 0;

  for (let index = context.finallyStack.length - 1; index >= targetFinallyDepth; index -= 1) {
    const frame = context.finallyStack[index];

    if (!frame || cursor === undefined) {
      return;
    }

    const previousFinallyStack = context.finallyStack;
    const previousNodeIdSuffix = context.nodeIdSuffix;
    context.abruptPathCounter.value += 1;
    context.finallyStack = previousFinallyStack.slice(0, index);
    context.nodeIdSuffix = `${previousNodeIdSuffix}_finally_${index}_${context.abruptPathCounter.value}`;
    cursor = renderFinalizer(frame.finalizer, cursor);
    context.finallyStack = previousFinallyStack;
    context.nodeIdSuffix = previousNodeIdSuffix;
  }

  if (cursor !== undefined && target !== undefined) {
    pushEdge(context, cursor, target.id, targetLabel);
  }
}
