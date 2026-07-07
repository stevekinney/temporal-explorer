import type { FlowNode } from '@temporal-explorer/schemas';

type LoopScope = { nodes: FlowNode[]; insideLoop: boolean };

/** Pairs each present child body with its loop flag, dropping the absent (optional) ones. */
function withScope(bodies: (FlowNode[] | undefined)[], insideLoop: boolean): LoopScope[] {
  return bodies
    .filter((nodes): nodes is FlowNode[] => nodes !== undefined)
    .map((nodes) => ({ nodes, insideLoop }));
}

/** The child node-lists to recurse into for a node, and whether each lies inside a loop body. */
function loopScopes(node: FlowNode, insideLoop: boolean): LoopScope[] {
  switch (node.type) {
    case 'branch':
      return withScope([...node.clauses.map((clause) => clause.body), node.otherwise], insideLoop);
    case 'loop':
      // Initializer, condition, update, and body all run once per iteration.
      return withScope([node.initializer, node.condition, node.update, node.body], true);
    case 'parallel':
      return withScope([...(node.branches ?? []), node.templateBranch], insideLoop);
    case 'try':
      return withScope([node.body, node.handler?.body, node.finalizer], insideLoop);
    case 'region':
      return withScope([node.body], insideLoop);
    default:
      return [];
  }
}

function collect(nodes: FlowNode[], insideLoop: boolean, into: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'command') {
      if (insideLoop) {
        into.add(node.commandId);
      }
      continue;
    }

    for (const scope of loopScopes(node, insideLoop)) {
      collect(scope.nodes, scope.insideLoop, into);
    }
  }
}

/**
 * The ids of every command that sits inside a loop body. Such a command is a single static
 * node that the runtime executes once per iteration, so — like a fan-out template — its extra
 * runtime occurrences must map back to it instead of falling off the end of the occurrence
 * list into unmapped, disconnected orphan nodes.
 */
export function collectLoopCommandIds(nodes: FlowNode[]): Set<string> {
  const into = new Set<string>();
  collect(nodes, false, into);
  return into;
}
