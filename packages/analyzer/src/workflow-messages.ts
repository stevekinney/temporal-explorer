import {
  Node,
  SyntaxKind,
  type CallExpression,
  type FunctionDeclaration,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph';

import type {
  QueryDefinition,
  SourceLocation,
  TypeShape,
  UpdateDefinition,
} from '@temporal-explorer/schemas';

import { createSourceLocation } from './paths';
import { isWorkflowModuleCall } from './symbols';
import { extractTupleShapes } from './tuple-shapes';
import { createTypeShape } from './type-shapes';

/** A module-level `defineQuery` or `defineUpdate` declaration keyed by variable name. */
export type DeclaredMessage = {
  variableName: string;
  kind: 'query' | 'update';
  name: string;
  source: SourceLocation;
  args: TypeShape[];
  result?: TypeShape;
  confidence: 'exact' | 'dynamic';
};

function readMessageName(call: CallExpression): { name: string; literal: boolean } {
  const firstArgument = call.getArguments()[0];

  if (firstArgument && Node.isStringLiteral(firstArgument)) {
    return { name: firstArgument.getLiteralValue(), literal: true };
  }

  return { name: firstArgument?.getText() || 'unknownMessage', literal: false };
}

function getMessageKind(initializer: CallExpression): 'query' | 'update' | undefined {
  if (isWorkflowModuleCall(initializer, 'defineQuery')) {
    return 'query';
  }

  return isWorkflowModuleCall(initializer, 'defineUpdate') ? 'update' : undefined;
}

function createDeclaredMessage(
  root: string,
  sourceFile: SourceFile,
  variableName: string,
  kind: 'query' | 'update',
  initializer: CallExpression,
): DeclaredMessage {
  const { name, literal } = readMessageName(initializer);
  const typeArguments = initializer.getTypeArguments();
  const resultText = typeArguments[0]?.getText();

  return {
    variableName,
    kind,
    name,
    source: createSourceLocation(root, sourceFile, initializer, name),
    args: extractTupleShapes(`${kind}:${name}`, typeArguments[1]?.getText()),
    ...(resultText ? { result: createTypeShape(`${kind}:${name}:result`, resultText) } : {}),
    confidence: literal ? 'exact' : 'dynamic',
  };
}

function readMessageDeclaration(
  root: string,
  sourceFile: SourceFile,
  declaration: VariableDeclaration,
): DeclaredMessage | undefined {
  const initializer = declaration.getInitializer();
  const nameNode = declaration.getNameNode();

  if (!initializer || !Node.isCallExpression(initializer) || !Node.isIdentifier(nameNode)) {
    return undefined;
  }

  const kind = getMessageKind(initializer);

  if (!kind) {
    return undefined;
  }

  return createDeclaredMessage(root, sourceFile, nameNode.getText(), kind, initializer);
}

/** Finds module-level `defineQuery` and `defineUpdate` declarations in a source file. */
export function findMessageDeclarations(
  root: string,
  sourceFile: SourceFile,
): Map<string, DeclaredMessage> {
  const declarations = new Map<string, DeclaredMessage>();

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const declared = readMessageDeclaration(root, sourceFile, declaration);

    if (declared) {
      declarations.set(declared.variableName, declared);
    }
  }

  return declarations;
}

/**
 * Resolves a `setHandler` first argument to its `defineQuery`/`defineUpdate` declaration,
 * whether inline (`setHandler(defineQuery('x'), ...)`), declared in the same file, or
 * imported from another module. Returns undefined for signals and unresolvable handles.
 */
function resolveDeclaredMessage(
  root: string,
  handleArgument: Node,
  declaredMessages: Map<string, DeclaredMessage>,
): DeclaredMessage | undefined {
  // Inline definition: `setHandler(defineQuery('getValue'), handler)`.
  if (Node.isCallExpression(handleArgument)) {
    const kind = getMessageKind(handleArgument);

    if (!kind) {
      return undefined;
    }

    const { name } = readMessageName(handleArgument);

    return createDeclaredMessage(root, handleArgument.getSourceFile(), name, kind, handleArgument);
  }

  if (!Node.isIdentifier(handleArgument)) {
    return undefined;
  }

  // Same-file declaration (fast path).
  const local = declaredMessages.get(handleArgument.getText());

  if (local) {
    return local;
  }

  // Cross-file: follow the import to the exported `defineQuery`/`defineUpdate` declaration.
  for (const definition of handleArgument.getDefinitionNodes()) {
    if (Node.isVariableDeclaration(definition)) {
      const declared = readMessageDeclaration(root, definition.getSourceFile(), definition);

      if (declared) {
        return declared;
      }
    }
  }

  return undefined;
}

export type MessageRegistration = {
  declared: DeclaredMessage;
  registration: CallExpression;
  handler: Node | undefined;
  validator: Node | undefined;
};

function readValidatorNode(call: CallExpression): Node | undefined {
  const options = call.getArguments()[2];

  if (!options || !Node.isObjectLiteralExpression(options)) {
    return undefined;
  }

  const property = options.getProperty('validator');

  if (property && Node.isPropertyAssignment(property)) {
    return property.getInitializer();
  }

  return property;
}

/** Finds `setHandler` registrations for declared queries and updates in one Workflow. */
export function findMessageRegistrations(
  root: string,
  functionDeclaration: FunctionDeclaration,
  declaredMessages: Map<string, DeclaredMessage>,
): MessageRegistration[] {
  const registrations: MessageRegistration[] = [];

  for (const call of functionDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!isWorkflowModuleCall(call, 'setHandler')) {
      continue;
    }

    const [handleArgument, handlerArgument] = call.getArguments();

    if (!handleArgument) {
      continue;
    }

    const declared = resolveDeclaredMessage(root, handleArgument, declaredMessages);

    if (!declared) {
      continue;
    }

    registrations.push({
      declared,
      registration: call,
      handler: handlerArgument,
      validator: readValidatorNode(call),
    });
  }

  return registrations;
}

/** Builds a QueryDefinition from a registration. */
export function createQueryDefinition(
  root: string,
  workflowName: string,
  registration: MessageRegistration,
): QueryDefinition {
  const { declared } = registration;

  return {
    id: `query:${workflowName}:${declared.name}`,
    name: declared.name,
    source: declared.source,
    args: declared.args,
    ...(declared.result ? { result: declared.result } : {}),
    handlerSource: createSourceLocation(
      root,
      registration.registration.getSourceFile(),
      registration.registration,
      declared.name,
    ),
    confidence: declared.confidence,
  };
}

/** Builds an UpdateDefinition from a registration. */
export function createUpdateDefinition(
  root: string,
  workflowName: string,
  registration: MessageRegistration,
): UpdateDefinition {
  const { declared } = registration;
  const sourceFile = registration.registration.getSourceFile();

  return {
    id: `update:${workflowName}:${declared.name}`,
    name: declared.name,
    source: declared.source,
    args: declared.args,
    ...(declared.result ? { result: declared.result } : {}),
    handlerSource: createSourceLocation(root, sourceFile, registration.registration, declared.name),
    ...(registration.validator
      ? {
          validatorSource: createSourceLocation(root, sourceFile, registration.validator),
        }
      : {}),
    confidence: declared.confidence,
  };
}
