import { Node, SyntaxKind, type FunctionDeclaration, type SourceFile } from 'ts-morph';

import type { Diagnostic } from '@temporal-explorer/schemas';

import { createSourceLocation } from './paths';
import { findMessageDeclarations } from './workflow-messages';
import { findSignalDeclarations } from './workflow-signals';

const unsafeBareModules = new Set([
  'fs',
  'path',
  'os',
  'http',
  'https',
  'net',
  'dns',
  'crypto',
  'child_process',
  'worker_threads',
  'cluster',
]);

const nondeterministicCalls = new Map<string, string>([
  ['Date.now', 'Date.now()'],
  ['Math.random', 'Math.random()'],
]);

function createDeterminismDiagnostic(
  root: string,
  code: string,
  message: string,
  node: Node,
  severity: 'error' | 'warning' = 'error',
): Diagnostic {
  return {
    code,
    category: 'determinism',
    severity,
    message,
    source: createSourceLocation(root, node.getSourceFile(), node),
    confidence: 'exact',
  };
}

/** Flags imports of Node built-ins and other unsafe modules in Workflow files. */
export function findUnsafeImportDiagnostics(root: string, sourceFile: SourceFile): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const specifier = importDeclaration.getModuleSpecifierValue();

    if (specifier.startsWith('node:') || unsafeBareModules.has(specifier)) {
      diagnostics.push(
        createDeterminismDiagnostic(
          root,
          'TEA_UNSAFE_WORKFLOW_IMPORT',
          `Workflow file imports ${specifier}, which is not available in the deterministic Workflow sandbox.`,
          importDeclaration,
        ),
      );
    }
  }

  return diagnostics;
}

/** Flags Date.now(), Math.random(), and argument-less new Date() in a Workflow body. */
export function findNondeterministicApiDiagnostics(
  root: string,
  functionDeclaration: FunctionDeclaration,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const call of functionDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expressionText = call.getExpression().getText();
    const label = nondeterministicCalls.get(expressionText);

    if (label) {
      diagnostics.push(
        createDeterminismDiagnostic(
          root,
          'TEA_NONDETERMINISTIC_API',
          `Potential nondeterministic API inside Workflow: ${label}`,
          call,
        ),
      );
    }
  }

  for (const newExpression of functionDeclaration.getDescendantsOfKind(SyntaxKind.NewExpression)) {
    if (
      newExpression.getExpression().getText() === 'Date' &&
      newExpression.getArguments().length === 0
    ) {
      diagnostics.push(
        createDeterminismDiagnostic(
          root,
          'TEA_NONDETERMINISTIC_API',
          'Potential nondeterministic API inside Workflow: new Date()',
          newExpression,
        ),
      );
    }
  }

  return diagnostics;
}

/** Flags duplicate Signal, Query, or Update names declared in one Workflow file. */
export function findDuplicateMessageDiagnostics(
  root: string,
  sourceFile: SourceFile,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const byName = new Map<string, number>();
  const declarations = [
    ...[...findSignalDeclarations(root, sourceFile).values()].map((declared) => ({
      name: declared.name,
      kind: 'Signal',
      source: declared.source,
    })),
    ...[...findMessageDeclarations(root, sourceFile).values()].map((declared) => ({
      name: declared.name,
      kind: declared.kind === 'query' ? 'Query' : 'Update',
      source: declared.source,
    })),
  ];

  for (const declared of declarations) {
    byName.set(declared.name, (byName.get(declared.name) ?? 0) + 1);
  }

  for (const declared of declarations) {
    if ((byName.get(declared.name) ?? 0) > 1) {
      diagnostics.push({
        code: 'TEA_DUPLICATE_MESSAGE_NAME',
        category: 'discovery',
        severity: 'error',
        message: `${declared.kind} name "${declared.name}" is defined more than once in this file.`,
        source: declared.source,
        confidence: 'exact',
      });
    }
  }

  return diagnostics;
}
