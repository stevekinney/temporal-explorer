import { Node, SyntaxKind, type CallExpression, type Identifier, type SourceFile } from 'ts-morph';

export const temporalWorkflowModule = '@temporalio/workflow';
export const temporalWorkerModule = '@temporalio/worker';

/** Reports whether a call invokes a named export of `@temporalio/workflow`, following import aliases. */
export function isWorkflowModuleCall(call: CallExpression, importedName: string): boolean {
  const expression = call.getExpression();
  return (
    Node.isIdentifier(expression) &&
    isNamedImportFrom(expression, temporalWorkflowModule, importedName)
  );
}

export function isNamedImportFrom(
  identifier: Identifier,
  moduleSpecifier: string,
  importedName: string,
): boolean {
  const symbol = identifier.getSymbol();

  return (
    symbol?.getDeclarations().some((declaration) => {
      if (!Node.isImportSpecifier(declaration)) {
        return false;
      }

      const importDeclaration = declaration.getImportDeclaration();
      const exportedName =
        declaration.compilerNode.propertyName?.getText() ?? declaration.getNameNode().getText();

      return (
        importDeclaration.getModuleSpecifierValue() === moduleSpecifier &&
        exportedName === importedName
      );
    }) ?? false
  );
}

function isProxyActivitiesCall(call: CallExpression): boolean {
  const expression = call.getExpression();
  return (
    Node.isIdentifier(expression) &&
    isNamedImportFrom(expression, temporalWorkflowModule, 'proxyActivities')
  );
}

function unwrapCasts(node: Node): Node {
  let current = node;

  while (Node.isAsExpression(current) || Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }

  return current;
}

/**
 * Finds every variable holding an Activity proxy, including aliases created
 * through `as` casts of an existing proxy variable. Two passes handle aliases
 * declared before their source in document order.
 */
export function findActivityProxyVariables(sourceFile: SourceFile): Set<string> {
  const proxyVariables = new Set<string>();

  for (let pass = 0; pass < 2; pass += 1) {
    for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const nameNode = declaration.getNameNode();
      const initializer = declaration.getInitializer();

      if (!initializer || !Node.isIdentifier(nameNode)) {
        continue;
      }

      const unwrapped = unwrapCasts(initializer);

      if (Node.isCallExpression(unwrapped) && isProxyActivitiesCall(unwrapped)) {
        proxyVariables.add(nameNode.getText());
      } else if (Node.isIdentifier(unwrapped) && proxyVariables.has(unwrapped.getText())) {
        proxyVariables.add(nameNode.getText());
      }
    }
  }

  return proxyVariables;
}
