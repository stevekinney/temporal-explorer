import type { FlowNode, TemporalCommand } from '@temporal-explorer/schemas';

import { toMermaidLabel } from './mermaid-format';

export type LoopTarget = {
  label: string | undefined;
  breakTarget: string;
  continueTarget: string;
};

export type RenderContext = {
  nodes: string[];
  edges: string[];
  counter: { value: number };
  startId: string;
  commandsById: Map<string, TemporalCommand>;
  loopTargets: LoopTarget[];
  finallyStack: { finalizer: FlowNode[] }[];
  nodeIdSuffix: string;
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

export function terminalTarget(
  node: Extract<FlowNode, { type: 'terminal' }>,
  context: RenderContext,
): string | undefined {
  if (node.terminalKind === 'break') {
    return matchingLoopTarget(node, context)?.breakTarget;
  }

  if (node.terminalKind === 'continue') {
    return matchingLoopTarget(node, context)?.continueTarget;
  }

  return undefined;
}

export function routeAbruptExit(
  from: string,
  target: string | undefined,
  context: RenderContext,
  renderFinalizer: (finalizer: FlowNode[], entry: string) => string | undefined,
  targetLabel?: string,
): void {
  let cursor: string | undefined = from;

  for (let index = context.finallyStack.length - 1; index >= 0; index -= 1) {
    const frame = context.finallyStack[index];

    if (!frame || cursor === undefined) {
      return;
    }

    const previousFinallyStack = context.finallyStack;
    const previousNodeIdSuffix = context.nodeIdSuffix;
    context.finallyStack = previousFinallyStack.slice(0, index);
    context.nodeIdSuffix = `${previousNodeIdSuffix}_finally_${index}`;
    cursor = renderFinalizer(frame.finalizer, cursor);
    context.finallyStack = previousFinallyStack;
    context.nodeIdSuffix = previousNodeIdSuffix;
  }

  if (cursor !== undefined && target !== undefined) {
    pushEdge(context, cursor, target, targetLabel);
  }
}
