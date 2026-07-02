import { Node, SyntaxKind } from 'ts-morph';

import type { Diagnostic } from '@temporal-explorer/schemas';

import { createSourceLocation } from './paths';
import { isWorkflowModuleCall } from './symbols';

const commandApiNames = [
  'sleep',
  'condition',
  'startChild',
  'executeChild',
  'continueAsNew',
  'getExternalWorkflowHandle',
] as const;

const assignmentOperators = new Set([
  SyntaxKind.EqualsToken,
  SyntaxKind.PlusEqualsToken,
  SyntaxKind.MinusEqualsToken,
  SyntaxKind.AsteriskEqualsToken,
  SyntaxKind.SlashEqualsToken,
  SyntaxKind.PercentEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken,
]);

function isFunctionLike(node: Node): boolean {
  return (
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isFunctionDeclaration(node)
  );
}

function isDeclaredInside(identifier: Node, container: Node): boolean {
  const symbol = identifier.getSymbol();

  return (
    symbol
      ?.getDeclarations()
      .some(
        (declaration) =>
          declaration.getSourceFile() === container.getSourceFile() &&
          declaration.getStart() >= container.getStart() &&
          declaration.getEnd() <= container.getEnd(),
      ) ?? false
  );
}

function createDiagnostic(root: string, code: string, message: string, node: Node): Diagnostic {
  return {
    code,
    category: 'determinism',
    severity: 'error',
    message,
    source: createSourceLocation(root, node.getSourceFile(), node),
    confidence: 'exact',
  };
}

function getAssignmentTarget(target: Node): Node | undefined {
  if (Node.isIdentifier(target)) {
    return target;
  }

  return Node.isPropertyAccessExpression(target) ? target.getExpression() : undefined;
}

function isOuterStateMutation(target: Node | undefined, handler: Node): boolean {
  return Boolean(target && Node.isIdentifier(target) && !isDeclaredInside(target, handler));
}

function createMutationDiagnostic(root: string, queryName: string, expression: Node): Diagnostic {
  return createDiagnostic(
    root,
    'TEA_QUERY_STATE_MUTATION',
    `Query handler ${queryName} mutates Workflow state: ${expression.getText()}`,
    expression,
  );
}

function findAssignmentMutations(
  root: string,
  queryName: string,
  handler: Node,
  diagnostics: Diagnostic[],
): void {
  for (const binary of handler.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (!assignmentOperators.has(binary.getOperatorToken().getKind())) {
      continue;
    }

    if (isOuterStateMutation(getAssignmentTarget(binary.getLeft()), handler)) {
      diagnostics.push(createMutationDiagnostic(root, queryName, binary));
    }
  }
}

function findIncrementMutations(
  root: string,
  queryName: string,
  handler: Node,
  diagnostics: Diagnostic[],
): void {
  const unaryExpressions = [
    ...handler.getDescendantsOfKind(SyntaxKind.PostfixUnaryExpression),
    ...handler.getDescendantsOfKind(SyntaxKind.PrefixUnaryExpression),
  ];

  for (const unary of unaryExpressions) {
    const operator = unary.getOperatorToken();

    if (operator !== SyntaxKind.PlusPlusToken && operator !== SyntaxKind.MinusMinusToken) {
      continue;
    }

    if (isOuterStateMutation(unary.getOperand(), handler)) {
      diagnostics.push(createMutationDiagnostic(root, queryName, unary));
    }
  }
}

function findMutationDiagnostics(
  root: string,
  queryName: string,
  handler: Node,
  diagnostics: Diagnostic[],
): void {
  findAssignmentMutations(root, queryName, handler, diagnostics);
  findIncrementMutations(root, queryName, handler, diagnostics);
}

function findCommandDiagnostics(
  root: string,
  queryName: string,
  handler: Node,
  proxyVariables: Set<string>,
  diagnostics: Diagnostic[],
): void {
  for (const call of handler.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression();

    if (Node.isPropertyAccessExpression(expression)) {
      const receiver = expression.getExpression();

      if (Node.isIdentifier(receiver) && proxyVariables.has(receiver.getText())) {
        diagnostics.push(
          createDiagnostic(
            root,
            'TEA_QUERY_COMMAND_IN_HANDLER',
            `Query handler ${queryName} calls Activity ${expression.getName()}.`,
            call,
          ),
        );
      }

      continue;
    }

    for (const apiName of commandApiNames) {
      if (isWorkflowModuleCall(call, apiName)) {
        diagnostics.push(
          createDiagnostic(
            root,
            'TEA_QUERY_COMMAND_IN_HANDLER',
            `Query handler ${queryName} uses ${apiName}, which is not allowed in Queries.`,
            call,
          ),
        );
      }
    }
  }
}

/** Analyzes a Query handler for async usage, state mutation, and command usage. */
export function analyzeQueryHandler(
  root: string,
  queryName: string,
  handler: Node | undefined,
  proxyVariables: Set<string>,
): Diagnostic[] {
  if (!handler || !isFunctionLike(handler)) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  if ((Node.isArrowFunction(handler) || Node.isFunctionExpression(handler)) && handler.isAsync()) {
    diagnostics.push(
      createDiagnostic(
        root,
        'TEA_QUERY_ASYNC_HANDLER',
        `Query handler ${queryName} may not be async.`,
        handler,
      ),
    );
  }

  findMutationDiagnostics(root, queryName, handler, diagnostics);
  findCommandDiagnostics(root, queryName, handler, proxyVariables, diagnostics);

  return diagnostics;
}

/** Analyzes an Update validator for async usage. */
export function analyzeUpdateValidator(
  root: string,
  updateName: string,
  validator: Node | undefined,
): Diagnostic[] {
  if (!validator) {
    return [];
  }

  if (
    (Node.isArrowFunction(validator) || Node.isFunctionExpression(validator)) &&
    validator.isAsync()
  ) {
    return [
      createDiagnostic(
        root,
        'TEA_UPDATE_ASYNC_VALIDATOR',
        `Update validator for ${updateName} may not be async.`,
        validator,
      ),
    ];
  }

  return [];
}
