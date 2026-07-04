import { Node, SyntaxKind, type CallExpression } from 'ts-morph';

import type { TemporalCommand } from '@temporal-explorer/schemas';

import { isWorkflowModuleCall } from './symbols';

/** Finds variables assigned from a `@temporalio/workflow` factory call (e.g. getExternalWorkflowHandle). */
export function findVariablesInitializedBy(scope: Node, importedName: string): Set<string> {
  const names = new Set<string>();

  for (const declaration of scope.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    const nameNode = declaration.getNameNode();

    if (
      initializer &&
      Node.isCallExpression(initializer) &&
      isWorkflowModuleCall(initializer, importedName) &&
      Node.isIdentifier(nameNode)
    ) {
      names.add(nameNode.getText());
    }
  }

  return names;
}

/** Resolves a `client.executeOperation(...)` / `startOperation(...)` call on a Nexus client to its operation name. */
export function getNexusOperationName(
  call: CallExpression,
  nexusClients: Set<string>,
): { name: string; confidence: TemporalCommand['confidence'] } | undefined {
  const expression = call.getExpression();

  if (
    !Node.isPropertyAccessExpression(expression) ||
    (expression.getName() !== 'executeOperation' && expression.getName() !== 'startOperation')
  ) {
    return undefined;
  }

  const receiver = expression.getExpression();

  if (!Node.isIdentifier(receiver) || !nexusClients.has(receiver.getText())) {
    return undefined;
  }

  const operationArgument = call.getArguments()[0];

  return operationArgument && Node.isStringLiteral(operationArgument)
    ? { name: operationArgument.getLiteralValue(), confidence: 'exact' }
    : { name: operationArgument?.getText() || 'nexusOperation', confidence: 'dynamic' };
}
