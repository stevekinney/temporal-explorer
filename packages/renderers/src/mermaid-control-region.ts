import type { FlowNode } from '@temporal-explorer/schemas';

import { nextNodeId, pushEdge, type RenderContext } from './mermaid-control-context';

export function renderRegionNode(
  node: Extract<FlowNode, { type: 'region' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
  renderSequence: (
    nodes: FlowNode[],
    entry: string,
    context: RenderContext,
    entryLabel?: string,
  ) => string | undefined,
): string | undefined {
  const exit = nextNodeId(context);
  context.nodes.push(`  ${exit}(( ))`);
  context.breakTargets.push({
    label: node.label,
    breakTarget: exit,
    finallyDepth: context.finallyStack.length,
  });
  const bodyExit = renderSequence(node.body, entry, context, label);
  context.breakTargets.pop();

  if (bodyExit !== undefined) pushEdge(context, bodyExit, exit);

  return bodyExit !== undefined || context.edges.some((edge) => edge.endsWith(` ${exit}`))
    ? exit
    : undefined;
}
