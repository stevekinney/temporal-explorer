import { Node, SyntaxKind, type CallExpression, type FunctionDeclaration } from 'ts-morph';

import { findVariablesInitializedBy } from './command-detection';
import {
  findActivityProxyVariables,
  findDestructuredActivityBindings,
  importsWorkflowModule,
  workflowModuleCallName,
} from './symbols';
import type { WalkContext } from './workflow-commands';
import { findSignalDeclarations } from './workflow-signals';

/** True when `node` is lexically inside `container` within the same source file. */
function isWithin(node: Node, container: Node): boolean {
  return (
    node.getSourceFile() === container.getSourceFile() &&
    node.getStart() >= container.getStart() &&
    node.getEnd() <= container.getEnd()
  );
}

/** Returns the walkable declaration for a resolved callee, or undefined if it is not a local function/method. */
function toWalkableCallee(node: Node): Node | undefined {
  if (Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)) {
    return node.getBody() ? node : undefined;
  }

  if (Node.isVariableDeclaration(node)) {
    const initializer = node.getInitializer();

    if (
      initializer &&
      (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
    ) {
      return initializer;
    }
  }

  return undefined;
}

/** Resolves a call to a module-local function/method declaration in a Workflow module, if any. */
function resolveLocalCallee(
  call: CallExpression,
  workflowFunction: FunctionDeclaration,
): Node | undefined {
  const expression = call.getExpression();
  const identifier = Node.isIdentifier(expression)
    ? expression
    : Node.isPropertyAccessExpression(expression)
      ? expression.getNameNode()
      : undefined;

  if (!identifier || !Node.isIdentifier(identifier)) {
    return undefined;
  }

  for (const definition of identifier.getDefinitionNodes()) {
    const declaration = toWalkableCallee(definition);

    if (
      declaration &&
      importsWorkflowModule(declaration.getSourceFile()) &&
      !isWithin(declaration, workflowFunction)
    ) {
      return declaration;
    }
  }

  return undefined;
}

/**
 * Interprocedural fallback: when a Workflow calls a module-local helper function
 * or method (not a Temporal SDK call, not an Activity proxy), walk one level into
 * that callee and collect its commands, attributing them to the calling Workflow
 * at the call site. The guards keep this tight — one level only (depth), Workflow
 * modules only (so Activity implementations are never entered), and callees
 * already covered by the Workflow's own descendant walk are skipped so nothing is
 * double-counted. The callee's own Activity proxies are resolved against its
 * source file so cross-file helpers are attributed correctly.
 */
export function collectLocalCalleeCommands(
  call: CallExpression,
  context: WalkContext,
  collect: (call: CallExpression, context: WalkContext) => void,
): void {
  if (context.depth >= 1 || workflowModuleCallName(call)) {
    return;
  }

  const callee = resolveLocalCallee(call, context.workflowFunction);

  if (!callee) {
    return;
  }

  const calleeSource = callee.getSourceFile();
  // A callee's own parameters and locals shadow file-level proxy variables of the
  // same name, so exclude them — otherwise a helper parameter that merely shares a
  // proxy variable's name would fabricate an Activity command.
  const shadowed = boundNames(callee);
  const fileProxies = findActivityProxyVariables(calleeSource);
  const proxyVariables = new Set([...fileProxies].filter((name) => !shadowed.has(name)));
  const destructuredActivities = new Map(
    [...findDestructuredActivityBindings(calleeSource, fileProxies)].filter(
      ([local]) => !shadowed.has(local),
    ),
  );
  const signalNamesByVariable = new Map<string, string>();

  for (const [variableName, declared] of findSignalDeclarations(context.root, calleeSource)) {
    signalNamesByVariable.set(variableName, declared.name);
  }

  const nested: WalkContext = {
    ...context,
    depth: context.depth + 1,
    proxyVariables,
    destructuredActivities,
    // External handles and Nexus clients are created inside the callee, so scan the
    // callee node itself (already correctly scoped, unlike the file-wide proxy scan).
    externalHandles: findVariablesInitializedBy(callee, 'getExternalWorkflowHandle'),
    nexusClients: findVariablesInitializedBy(callee, 'createNexusServiceClient'),
    signalNamesByVariable,
  };

  for (const nestedCall of callee.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    collect(nestedCall, nested);
  }
}

/** Parameter and local variable names bound inside a callee, which shadow file-level proxy variables. */
function boundNames(callee: Node): Set<string> {
  const names = new Set<string>();

  if (
    Node.isFunctionDeclaration(callee) ||
    Node.isMethodDeclaration(callee) ||
    Node.isArrowFunction(callee) ||
    Node.isFunctionExpression(callee)
  ) {
    for (const parameter of callee.getParameters()) {
      const nameNode = parameter.getNameNode();

      if (Node.isIdentifier(nameNode)) {
        names.add(nameNode.getText());
      }
    }
  }

  for (const declaration of callee.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = declaration.getNameNode();

    if (Node.isIdentifier(nameNode)) {
      names.add(nameNode.getText());
    }
  }

  return names;
}
