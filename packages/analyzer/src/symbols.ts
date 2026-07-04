import {
  Node,
  SyntaxKind,
  type CallExpression,
  type Identifier,
  type ObjectBindingPattern,
  type SourceFile,
} from 'ts-morph';

export const temporalWorkflowModule = '@temporalio/workflow';
export const temporalWorkerModule = '@temporalio/worker';

/**
 * True when a source file has a value (non-type) import of `@temporalio/workflow`.
 * This is the same signal content-based Workflow discovery uses, so it marks a
 * file as a Workflow module (and excludes Activity implementation files, which
 * never import the Workflow SDK) when deciding whether to walk into a callee.
 */
export function importsWorkflowModule(sourceFile: SourceFile): boolean {
  return sourceFile.getImportDeclarations().some((declaration) => {
    if (
      declaration.getModuleSpecifierValue() !== temporalWorkflowModule ||
      declaration.isTypeOnly()
    ) {
      return false;
    }

    return (
      Boolean(declaration.getDefaultImport()) ||
      Boolean(declaration.getNamespaceImport()) ||
      declaration.getNamedImports().some((named) => !named.isTypeOnly())
    );
  });
}

/** Follows import aliases to the export name a named-import identifier resolves to, if any. */
export function namedImportExportName(
  identifier: Identifier,
  moduleSpecifier: string,
): string | undefined {
  for (const declaration of identifier.getSymbol()?.getDeclarations() ?? []) {
    if (!Node.isImportSpecifier(declaration)) {
      continue;
    }

    if (declaration.getImportDeclaration().getModuleSpecifierValue() !== moduleSpecifier) {
      continue;
    }

    return declaration.compilerNode.propertyName?.getText() ?? declaration.getNameNode().getText();
  }

  return undefined;
}

export function isNamedImportFrom(
  identifier: Identifier,
  moduleSpecifier: string,
  importedName: string,
): boolean {
  return namedImportExportName(identifier, moduleSpecifier) === importedName;
}

/** Reports whether an identifier is an `import * as ns` namespace binding of a module. */
export function isNamespaceImportOf(identifier: Identifier, moduleSpecifier: string): boolean {
  return (
    identifier
      .getSymbol()
      ?.getDeclarations()
      .some((declaration) => {
        if (!Node.isNamespaceImport(declaration)) {
          return false;
        }

        const importDeclaration = declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);

        return importDeclaration?.getModuleSpecifierValue() === moduleSpecifier;
      }) ?? false
  );
}

/**
 * Resolves the `@temporalio/workflow` export a call targets, following import
 * aliases and namespace imports. Handles both `sleep(...)` (named import) and
 * `wf.sleep(...)` (`import * as wf from '@temporalio/workflow'`).
 */
export function workflowModuleCallName(call: CallExpression): string | undefined {
  const expression = call.getExpression();

  if (Node.isIdentifier(expression)) {
    return namedImportExportName(expression, temporalWorkflowModule);
  }

  if (Node.isPropertyAccessExpression(expression)) {
    const receiver = expression.getExpression();

    if (Node.isIdentifier(receiver) && isNamespaceImportOf(receiver, temporalWorkflowModule)) {
      return expression.getName();
    }
  }

  return undefined;
}

/** Reports whether a call invokes a named export of `@temporalio/workflow`, following import aliases and namespace imports. */
export function isWorkflowModuleCall(call: CallExpression, importedName: string): boolean {
  return workflowModuleCallName(call) === importedName;
}

/** Activity proxy factories whose returned object exposes callable Activity methods. */
const activityProxyFactories = new Set(['proxyActivities', 'proxyLocalActivities']);

function isProxyActivitiesCall(call: CallExpression): boolean {
  const name = workflowModuleCallName(call);
  return name !== undefined && activityProxyFactories.has(name);
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

/**
 * Maps destructured Activity proxy bindings to their Activity types, e.g.
 * `const { reserveInventory: reserve } = proxyActivities<...>(...)` yields
 * `reserve -> reserveInventory`. Destructuring the proxy is the dominant
 * convention in real Temporal TypeScript projects.
 */
function isProxySourceExpression(node: Node, proxyVariables: Set<string>): boolean {
  const unwrapped = unwrapCasts(node);

  return (
    (Node.isCallExpression(unwrapped) && isProxyActivitiesCall(unwrapped)) ||
    (Node.isIdentifier(unwrapped) && proxyVariables.has(unwrapped.getText()))
  );
}

function collectBindingElements(
  pattern: ObjectBindingPattern,
  bindings: Map<string, string>,
): void {
  for (const element of pattern.getElements()) {
    const localNameNode = element.getNameNode();

    if (Node.isIdentifier(localNameNode)) {
      const activityName = element.getPropertyNameNode()?.getText() ?? localNameNode.getText();
      bindings.set(localNameNode.getText(), activityName);
    }
  }
}

export function findDestructuredActivityBindings(
  sourceFile: SourceFile,
  proxyVariables: Set<string>,
): Map<string, string> {
  const bindings = new Map<string, string>();

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = declaration.getNameNode();
    const initializer = declaration.getInitializer();

    if (
      initializer &&
      Node.isObjectBindingPattern(nameNode) &&
      isProxySourceExpression(initializer, proxyVariables)
    ) {
      collectBindingElements(nameNode, bindings);
    }
  }

  return bindings;
}
