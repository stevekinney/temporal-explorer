import {
  Node,
  SyntaxKind,
  type FunctionDeclaration,
  type IfStatement,
  type Statement,
  type SwitchStatement,
  type TryStatement,
} from 'ts-morph';

import type { FlowNode, TemporalCommand } from '@temporal-explorer/schemas';

import {
  commandLeaf,
  commandLeavesIn,
  consumeTestCommand,
  inlineFlow,
  nextId,
  structuralSource,
  type BuildContext,
} from './control-flow-builders';

function buildBranch(statement: IfStatement, context: BuildContext): FlowNode {
  const source = structuralSource(context, statement);
  const testCommandId = consumeTestCommand(statement.getExpression(), context);
  const clauses: { label: string; body: FlowNode[] }[] = [];
  let current: IfStatement | undefined = statement;
  let otherwise: FlowNode[] | undefined;

  while (current) {
    clauses.push({
      label: current.getExpression().getText(),
      body: walkStatement(current.getThenStatement(), context),
    });

    const elseStatement = current.getElseStatement();

    if (elseStatement && Node.isIfStatement(elseStatement)) {
      current = elseStatement;
    } else {
      otherwise = elseStatement ? walkStatement(elseStatement, context) : undefined;
      current = undefined;
    }
  }

  return {
    type: 'branch',
    id: nextId(context),
    branchKind: 'if',
    source,
    ...(testCommandId ? { testCommandId } : {}),
    clauses,
    ...(otherwise ? { otherwise } : {}),
  };
}

function buildSwitch(statement: SwitchStatement, context: BuildContext): FlowNode {
  const clauses: { label: string; body: FlowNode[]; fallsThrough?: boolean }[] = [];
  let otherwise: FlowNode[] | undefined;

  for (const clause of statement.getCaseBlock().getClauses()) {
    const body = clause.getStatements().flatMap((inner) => walkStatement(inner, context));

    if (Node.isDefaultClause(clause)) {
      otherwise = body;
    } else {
      clauses.push({ label: clause.getExpression().getText(), body });
    }
  }

  return {
    type: 'branch',
    id: nextId(context),
    branchKind: 'switch',
    source: structuralSource(context, statement),
    clauses,
    ...(otherwise ? { otherwise } : {}),
  };
}

const loopKinds = new Map<SyntaxKind, 'for' | 'for-of' | 'for-in' | 'while' | 'do-while'>([
  [SyntaxKind.ForStatement, 'for'],
  [SyntaxKind.ForOfStatement, 'for-of'],
  [SyntaxKind.ForInStatement, 'for-in'],
  [SyntaxKind.WhileStatement, 'while'],
  [SyntaxKind.DoStatement, 'do-while'],
]);

function loopBodyStatement(statement: Statement): Statement | undefined {
  if (
    Node.isForStatement(statement) ||
    Node.isForOfStatement(statement) ||
    Node.isForInStatement(statement) ||
    Node.isWhileStatement(statement) ||
    Node.isDoStatement(statement)
  ) {
    return statement.getStatement();
  }

  return undefined;
}

function buildLoop(statement: Statement, context: BuildContext): FlowNode {
  const loopKind = loopKinds.get(statement.getKind()) ?? 'while';
  const bodyStatement = loopBodyStatement(statement);
  const body = bodyStatement ? walkStatement(bodyStatement, context) : [];

  return {
    type: 'loop',
    id: nextId(context),
    loopKind,
    source: structuralSource(context, statement),
    body,
  };
}

function buildTry(statement: TryStatement, context: BuildContext): FlowNode {
  const catchClause = statement.getCatchClause();
  const finallyBlock = statement.getFinallyBlock();

  return {
    type: 'try',
    id: nextId(context),
    source: structuralSource(context, statement),
    body: walkStatements(statement.getTryBlock().getStatements(), context),
    ...(catchClause
      ? {
          handler: {
            ...(catchClause.getVariableDeclaration()
              ? { label: catchClause.getVariableDeclaration()?.getText() }
              : {}),
            body: walkStatements(catchClause.getBlock().getStatements(), context),
          },
        }
      : {}),
    ...(finallyBlock ? { finalizer: walkStatements(finallyBlock.getStatements(), context) } : {}),
  };
}

function buildReturn(statement: Statement, context: BuildContext): FlowNode[] {
  const commands = commandLeavesIn(statement, context);
  const isTopLevel = statement.getParent() === context.functionBody;

  if (isTopLevel) {
    return commands;
  }

  return [
    ...commands,
    {
      type: 'terminal',
      id: nextId(context),
      terminalKind: 'return',
      source: structuralSource(context, statement),
    },
  ];
}

function buildThrow(statement: Statement, context: BuildContext): FlowNode[] {
  return [
    ...commandLeavesIn(statement, context),
    {
      type: 'terminal',
      id: nextId(context),
      terminalKind: 'throw',
      source: structuralSource(context, statement),
    },
  ];
}

function terminalStatement(
  terminalKind: 'break' | 'continue',
  statement: Statement,
  context: BuildContext,
): FlowNode {
  return {
    type: 'terminal',
    id: nextId(context),
    terminalKind,
    source: structuralSource(context, statement),
  };
}

function walkStatement(statement: Statement, context: BuildContext): FlowNode[] {
  if (Node.isBlock(statement)) {
    return walkStatements(statement.getStatements(), context);
  }

  if (Node.isIfStatement(statement)) {
    return [buildBranch(statement, context)];
  }

  if (Node.isSwitchStatement(statement)) {
    return [buildSwitch(statement, context)];
  }

  if (loopKinds.has(statement.getKind())) {
    return [buildLoop(statement, context)];
  }

  if (Node.isTryStatement(statement)) {
    return [buildTry(statement, context)];
  }

  if (Node.isReturnStatement(statement)) {
    return buildReturn(statement, context);
  }

  if (Node.isThrowStatement(statement)) {
    return buildThrow(statement, context);
  }

  if (Node.isBreakStatement(statement)) {
    return [terminalStatement('break', statement, context)];
  }

  if (Node.isContinueStatement(statement)) {
    return [terminalStatement('continue', statement, context)];
  }

  return inlineFlow(statement, context);
}

function walkStatements(statements: Statement[], context: BuildContext): FlowNode[] {
  return statements.flatMap((statement) => walkStatement(statement, context));
}

/**
 * Builds a Workflow body's structured control-flow tree from its statements,
 * referencing the already-collected `temporalCommands` by source location so
 * the flat command list (and the runtime-overlay mapping keyed off it) is
 * untouched. Cancellation scopes are excluded — they render as attached nodes.
 */
export function buildControlFlow(
  root: string,
  workflowName: string,
  functionDeclaration: FunctionDeclaration,
  commands: TemporalCommand[],
): FlowNode[] {
  const byOffset = new Map<number, TemporalCommand[]>();

  for (const command of commands) {
    if (command.kind === 'cancellation-scope') {
      continue;
    }

    const offset = command.source.start.offset;
    const existing = byOffset.get(offset);

    if (existing) {
      existing.push(command);
    } else {
      byOffset.set(offset, [command]);
    }
  }

  const body = functionDeclaration.getBody();
  const context: BuildContext = {
    root,
    workflowName,
    functionBody: body,
    byOffset,
    consumed: new Set(),
    counter: { value: 0 },
  };
  const nodes = body && Node.isBlock(body) ? walkStatements(body.getStatements(), context) : [];

  // Safety net: any flow command the structured walk did not place (e.g. inside
  // an unsupported construct) is appended so the render stays complete.
  const leftover = commands
    .filter((command) => command.kind !== 'cancellation-scope' && !context.consumed.has(command.id))
    .toSorted((left, right) => left.staticOrder - right.staticOrder)
    .map((command) => commandLeaf(command, context));

  return [...nodes, ...leftover];
}
