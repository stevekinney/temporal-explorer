import {
  Node,
  SyntaxKind,
  type CallExpression,
  type ConditionalExpression,
  type Expression,
  type Statement,
  type Node as TsNode,
} from 'ts-morph';

import type { FlowNode, SourceLocation, TemporalCommand } from '@temporal-explorer/schemas';

import { createSourceLocation } from './paths';

/** Shared state threaded through the control-flow walk. */
export type BuildContext = {
  root: string;
  workflowName: string;
  functionBody: TsNode | undefined;
  byOffset: Map<number, TemporalCommand[]>;
  consumed: Set<string>;
  counter: { value: number };
};

export function nextId(context: BuildContext): string {
  context.counter.value += 1;
  return `flow:${context.workflowName}:${context.counter.value}`;
}

export function structuralSource(context: BuildContext, node: TsNode): SourceLocation {
  return createSourceLocation(context.root, node.getSourceFile(), node);
}

/** Strips `await`, parentheses, and `as` casts to reach the underlying expression. */
function unwrap(expression: Expression): Expression {
  let current: Expression = expression;

  while (
    Node.isAwaitExpression(current) ||
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current)
  ) {
    current = current.getExpression();
  }

  return current;
}

/** Reports whether a call sits inside a nested function/arrow within `boundary` (a handler or callback, not main flow). */
function isInsideNestedFunction(call: TsNode, boundary: TsNode): boolean {
  let current = call.getParent();

  while (current && current !== boundary) {
    if (Node.isArrowFunction(current) || Node.isFunctionExpression(current)) {
      return true;
    }

    current = current.getParent();
  }

  return false;
}

export function commandLeaf(command: TemporalCommand, context: BuildContext): FlowNode {
  context.consumed.add(command.id);
  return { type: 'command', id: nextId(context), commandId: command.id, source: command.source };
}

/** Returns the not-yet-consumed commands whose call site is at `offset`. */
function commandsAt(offset: number, context: BuildContext): TemporalCommand[] {
  return (context.byOffset.get(offset) ?? []).filter(
    (command) => !context.consumed.has(command.id),
  );
}

/**
 * Emits command leaves for every command call site directly inside `node`,
 * skipping calls nested in a callback/handler (which are not main flow) unless
 * `includeNested` is set (used when walking a parallel branch's own callback).
 */
export function commandLeavesIn(
  node: TsNode,
  context: BuildContext,
  includeNested = false,
): FlowNode[] {
  const leaves: FlowNode[] = [];
  // `getDescendantsOfKind` excludes the node itself, so a branch arm or array
  // element that IS a bare call — `a()` in `Promise.all([a(), b()])`, or a
  // ternary arm `cond ? a() : b()` — needs the node included explicitly, or its
  // command is never emitted (the region renders as an empty box). Mirrors the
  // include-self handling in `consumeTestCommand`.
  const descendants = node.getDescendantsOfKind(SyntaxKind.CallExpression);
  const calls = (Node.isCallExpression(node) ? [node, ...descendants] : descendants).toSorted(
    (left, right) => left.getStart() - right.getStart(),
  );

  for (const call of calls) {
    // `call === node` can't be nested inside a function within itself; guarding
    // on it keeps the self-inclusion above from being wrongly filtered out.
    if (!includeNested && call !== node && isInsideNestedFunction(call, node)) {
      continue;
    }

    for (const command of commandsAt(call.getStart(), context)) {
      leaves.push(commandLeaf(command, context));
    }
  }

  return leaves;
}

const promiseCombinators = new Set(['all', 'allSettled', 'race', 'any']);

/** Resolves `Promise.all`/`race`/... to its combinator name. */
function promiseCombinatorName(
  call: CallExpression,
): 'all' | 'allSettled' | 'race' | 'any' | undefined {
  const expression = call.getExpression();

  if (!Node.isPropertyAccessExpression(expression)) {
    return undefined;
  }

  const receiver = expression.getExpression();
  const name = expression.getName();

  if (Node.isIdentifier(receiver) && receiver.getText() === 'Promise' && isCombinator(name)) {
    return name;
  }

  return undefined;
}

function isCombinator(name: string): name is 'all' | 'allSettled' | 'race' | 'any' {
  return promiseCombinators.has(name);
}

function markFanOut(commandId: string, context: BuildContext): void {
  for (const commands of context.byOffset.values()) {
    for (const command of commands) {
      if (command.id === commandId) {
        command.cardinality = 'fan-out';
      }
    }
  }
}

function buildParallel(
  call: CallExpression,
  combinator: 'all' | 'allSettled' | 'race' | 'any',
  context: BuildContext,
): FlowNode {
  const argument = call.getArguments()[0];
  const base = {
    type: 'parallel' as const,
    id: nextId(context),
    parallelKind: combinator,
    source: structuralSource(context, call),
  };

  // `Promise.all([a(), b()])` is fixed parallelism: one branch per element.
  if (argument && Node.isArrayLiteralExpression(argument)) {
    const branches = argument
      .getElements()
      .map((element) => commandLeavesIn(element, context, true));

    return { ...base, cardinality: 'fixed', branches };
  }

  // `Promise.all(items.map((x) => ...))` (or any non-array argument) is a
  // dynamic fan-out: one template branch executed an unknown number of times.
  const templateBranch = commandLeavesIn(argument ?? call, context, true);

  for (const leaf of templateBranch) {
    if (leaf.type === 'command') {
      markFanOut(leaf.commandId, context);
    }
  }

  return { ...base, cardinality: 'dynamic', templateBranch };
}

function continueAsNewTerminal(call: CallExpression, context: BuildContext): FlowNode | undefined {
  const command = commandsAt(call.getStart(), context).find(
    (candidate) => candidate.kind === 'continue-as-new',
  );

  if (!command) {
    return undefined;
  }

  context.consumed.add(command.id);

  return {
    type: 'terminal',
    id: nextId(context),
    terminalKind: 'continue-as-new',
    source: command.source,
    commandId: command.id,
  };
}

/** The primary awaited/initializer expression of a leaf statement, unwrapped. */
function primaryExpression(statement: Statement): Expression | undefined {
  if (Node.isExpressionStatement(statement)) {
    return unwrap(statement.getExpression());
  }

  if (Node.isVariableStatement(statement)) {
    const initializer = statement.getDeclarations()[0]?.getInitializer();
    return initializer ? unwrap(initializer) : undefined;
  }

  return undefined;
}

/** Models a `test ? whenTrue : whenFalse` expression as a two-way branch. */
function buildTernary(conditional: ConditionalExpression, context: BuildContext): FlowNode {
  const testCommandId = consumeTestCommand(conditional.getCondition(), context);
  const whenTrue = commandLeavesIn(conditional.getWhenTrue(), context, true);
  const whenFalse = commandLeavesIn(conditional.getWhenFalse(), context, true);

  return {
    type: 'branch',
    id: nextId(context),
    branchKind: 'ternary',
    source: structuralSource(context, conditional),
    ...(testCommandId ? { testCommandId } : {}),
    clauses: [{ label: conditional.getCondition().getText(), body: whenTrue }],
    otherwise: whenFalse,
  };
}

/** Handles a leaf statement (expression/variable/etc): parallelism, continueAsNew, ternary, or plain commands. */
export function inlineFlow(statement: Statement, context: BuildContext): FlowNode[] {
  const expression = primaryExpression(statement);

  if (expression && Node.isCallExpression(expression)) {
    const combinator = promiseCombinatorName(expression);

    if (combinator) {
      return [buildParallel(expression, combinator, context)];
    }

    const terminal = continueAsNewTerminal(expression, context);

    if (terminal) {
      return [terminal];
    }
  }

  if (expression && Node.isConditionalExpression(expression)) {
    return [buildTernary(expression, context)];
  }

  return commandLeavesIn(statement, context);
}

/** If a branch/loop test is decided by a flow command (patched(), condition()), consume it and return its id. */
export function consumeTestCommand(test: Expression, context: BuildContext): string | undefined {
  // getDescendantsOfKind excludes the node itself, so `if (patched('x'))` — whose
  // test IS the call — needs the test node included explicitly.
  const calls = Node.isCallExpression(test)
    ? [test, ...test.getDescendantsOfKind(SyntaxKind.CallExpression)]
    : test.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const [command] = commandsAt(call.getStart(), context);

    if (command) {
      context.consumed.add(command.id);
      return command.id;
    }
  }

  return undefined;
}
