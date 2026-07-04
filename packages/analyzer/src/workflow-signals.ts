import {
  Node,
  SyntaxKind,
  type CallExpression,
  type FunctionDeclaration,
  type SourceFile,
  type VariableDeclaration,
} from 'ts-morph';

import type { SignalDefinition, SourceLocation, TypeShape } from '@temporal-explorer/schemas';

import { createSourceLocation } from './paths';
import { isWorkflowModuleCall } from './symbols';
import { createTypeShape } from './type-shapes';

/** A module-level `defineSignal` declaration keyed by its variable name. */
export type DeclaredSignal = {
  variableName: string;
  name: string;
  source: SourceLocation;
  args: TypeShape[];
  confidence: 'exact' | 'dynamic';
};

function extractSignalPayloadShapes(
  signalName: string,
  typeArgumentText: string | undefined,
): TypeShape[] {
  if (!typeArgumentText) {
    return [];
  }

  const tupleContents = typeArgumentText.replace(/^\[/u, '').replace(/\]$/u, '').trim();

  if (!tupleContents) {
    return [];
  }

  return splitTopLevel(tupleContents).map((display, index) =>
    createTypeShape(`signal:${signalName}:arg:${index}`, display),
  );
}

const nestingOpeners = new Set(['<', '[', '{', '(']);
const nestingClosers = new Set(['>', ']', '}', ')']);

/** Splits a tuple type's contents on top-level commas, preserving nested generics. */
function splitTopLevel(contents: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of contents) {
    if (nestingOpeners.has(character)) {
      depth += 1;
    } else if (nestingClosers.has(character)) {
      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function getDefineSignalCall(declaration: VariableDeclaration): CallExpression | undefined {
  const initializer = declaration.getInitializer();

  if (!initializer || !Node.isCallExpression(initializer)) {
    return undefined;
  }

  return isWorkflowModuleCall(initializer, 'defineSignal') ? initializer : undefined;
}

function readSignalName(call: CallExpression): { name: string; literal: boolean } {
  const firstArgument = call.getArguments()[0];

  if (firstArgument && Node.isStringLiteral(firstArgument)) {
    return { name: firstArgument.getLiteralValue(), literal: true };
  }

  return { name: firstArgument?.getText() || 'unknownSignal', literal: false };
}

function readSignalDeclaration(
  root: string,
  sourceFile: SourceFile,
  declaration: VariableDeclaration,
): DeclaredSignal | undefined {
  const call = getDefineSignalCall(declaration);
  const nameNode = declaration.getNameNode();

  if (!call || !Node.isIdentifier(nameNode)) {
    return undefined;
  }

  const { name, literal } = readSignalName(call);

  return {
    variableName: nameNode.getText(),
    name,
    source: createSourceLocation(root, sourceFile, call, name),
    args: extractSignalPayloadShapes(name, call.getTypeArguments()[0]?.getText()),
    confidence: literal ? 'exact' : 'dynamic',
  };
}

/** Finds module-level `defineSignal` declarations in a Workflow source file. */
export function findSignalDeclarations(
  root: string,
  sourceFile: SourceFile,
): Map<string, DeclaredSignal> {
  const declarations = new Map<string, DeclaredSignal>();

  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const declared = readSignalDeclaration(root, sourceFile, declaration);

    if (declared) {
      declarations.set(declared.variableName, declared);
    }
  }

  return declarations;
}

/**
 * Resolves a `setHandler` first argument to its `defineSignal` declaration,
 * whether inline (`setHandler(defineSignal('x'), ...)`), declared in the same file,
 * or imported from another module. Returns undefined for non-signal handles.
 */
function resolveDeclaredSignal(
  root: string,
  handleArgument: Node,
  declaredSignals: Map<string, DeclaredSignal>,
): DeclaredSignal | undefined {
  // Inline definition: `setHandler(defineSignal('ready'), handler)`.
  if (Node.isCallExpression(handleArgument)) {
    return isWorkflowModuleCall(handleArgument, 'defineSignal')
      ? readSignalDeclarationFromCall(root, handleArgument)
      : undefined;
  }

  if (!Node.isIdentifier(handleArgument)) {
    return undefined;
  }

  // Same-file declaration (fast path).
  const local = declaredSignals.get(handleArgument.getText());

  if (local) {
    return local;
  }

  // Cross-file: follow the import to the exported `defineSignal` declaration.
  for (const definition of handleArgument.getDefinitionNodes()) {
    if (Node.isVariableDeclaration(definition)) {
      const declared = readSignalDeclaration(root, definition.getSourceFile(), definition);

      if (declared) {
        return declared;
      }
    }
  }

  return undefined;
}

/** Builds a DeclaredSignal from an inline `defineSignal(...)` call (no variable name). */
function readSignalDeclarationFromCall(root: string, call: CallExpression): DeclaredSignal {
  const { name, literal } = readSignalName(call);

  return {
    variableName: name,
    name,
    source: createSourceLocation(root, call.getSourceFile(), call, name),
    args: extractSignalPayloadShapes(name, call.getTypeArguments()[0]?.getText()),
    confidence: literal ? 'exact' : 'dynamic',
  };
}

/** Finds `setHandler` registrations for declared signals inside one Workflow function. */
export function findSignalRegistrations(
  root: string,
  workflowName: string,
  functionDeclaration: FunctionDeclaration,
  declaredSignals: Map<string, DeclaredSignal>,
): SignalDefinition[] {
  const registrations: SignalDefinition[] = [];
  const sourceFile = functionDeclaration.getSourceFile();

  for (const call of functionDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!isWorkflowModuleCall(call, 'setHandler')) {
      continue;
    }

    const [handleArgument] = call.getArguments();

    if (!handleArgument) {
      continue;
    }

    const declared = resolveDeclaredSignal(root, handleArgument, declaredSignals);

    if (!declared) {
      continue;
    }

    registrations.push({
      id: `signal:${workflowName}:${declared.name}`,
      name: declared.name,
      source: declared.source,
      args: declared.args,
      handlerSource: createSourceLocation(root, sourceFile, call, declared.name),
      confidence: declared.confidence,
    });
  }

  return registrations.toSorted((left, right) => left.name.localeCompare(right.name));
}
