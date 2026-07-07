import type { FlowNode } from '@temporal-explorer/schemas';

import { addStructural, pushEdge, type FlowContext } from './projection-flow-core';

type WalkArm = (
  body: FlowNode[],
  entry: string,
  join: string,
  label: string,
  parentId: string | undefined,
  context: FlowContext,
) => boolean;

type WalkSequence = (
  nodes: FlowNode[],
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  entryLabel?: string,
) => string | undefined;

export function walkParallel(
  node: Extract<FlowNode, { type: 'parallel' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
  walkArm: WalkArm,
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
  const branches =
    node.cardinality === 'dynamic' ? [node.templateBranch ?? []] : (node.branches ?? []);

  for (const branch of branches) {
    walkArm(branch, fork, join, node.cardinality === 'dynamic' ? '×N' : '', container, context);
  }

  return join;
}

export function walkRegion(
  node: Extract<FlowNode, { type: 'region' }>,
  entry: string,
  parentId: string | undefined,
  context: FlowContext,
  label: string,
  walkSequence: WalkSequence,
): string | undefined {
  const container = addStructural(context, 'branch-region', node.label, parentId, true);
  const exit = addStructural(context, 'join', '', container);
  context.breakTargets.push({
    label: node.label,
    breakTarget: exit,
    finallyDepth: context.finallyStack.length,
  });
  const bodyExit = walkSequence(node.body, entry, container, context, label);
  context.breakTargets.pop();

  if (bodyExit !== undefined) pushEdge(context, bodyExit, exit, '');

  return bodyExit !== undefined || context.edges.some((edge) => edge.target === exit)
    ? exit
    : undefined;
}
