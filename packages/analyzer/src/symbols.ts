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

export function findActivityProxyVariables(sourceFile: SourceFile): Set<string> {
  const proxyVariables = new Set<string>();

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();

    if (
      !initializer ||
      !Node.isCallExpression(initializer) ||
      !isProxyActivitiesCall(initializer)
    ) {
      continue;
    }

    const nameNode = declaration.getNameNode();

    if (Node.isIdentifier(nameNode)) {
      proxyVariables.add(nameNode.getText());
    }
  }

  return proxyVariables;
}
