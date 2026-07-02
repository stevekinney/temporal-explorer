import type { SourceFile } from 'ts-morph';

import type {
  QueryDefinition,
  SignalDefinition,
  UpdateDefinition,
  WorkflowDefinition,
  WorkflowDependency,
} from '@temporal-explorer/schemas';

import { toProjectPath } from './paths';

type NamedTypeSource = {
  name: string;
  module: string;
};

function toModulePath(root: string, filePath: string): string {
  return toProjectPath(root, filePath).replace(/\.tsx?$/u, '');
}

/** Collects project-owned named types importable by generated declarations. */
function collectNamedTypeSources(root: string, sourceFile: SourceFile): NamedTypeSource[] {
  const sources: NamedTypeSource[] = [];

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const moduleSourceFile = importDeclaration.getModuleSpecifierSourceFile();

    if (!moduleSourceFile || moduleSourceFile.isInNodeModules()) {
      continue;
    }

    const module = toModulePath(root, moduleSourceFile.getFilePath());

    for (const namedImport of importDeclaration.getNamedImports()) {
      sources.push({ name: namedImport.getName(), module });
    }
  }

  const ownModule = toModulePath(root, sourceFile.getFilePath());

  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (typeAlias.isExported()) {
      sources.push({ name: typeAlias.getName(), module: ownModule });
    }
  }

  for (const interfaceDeclaration of sourceFile.getInterfaces()) {
    if (interfaceDeclaration.isExported()) {
      sources.push({ name: interfaceDeclaration.getName(), module: ownModule });
    }
  }

  return sources;
}

function collectDisplayTexts(
  workflow: Pick<WorkflowDefinition, 'signature'>,
  signals: SignalDefinition[],
  queries: QueryDefinition[],
  updates: UpdateDefinition[],
): string[] {
  const texts = [
    ...workflow.signature.args.map((arg) => arg.display),
    workflow.signature.result.display,
  ];

  for (const message of [...signals, ...queries, ...updates]) {
    texts.push(...message.args.map((arg) => arg.display));
  }

  for (const message of [...queries, ...updates]) {
    if (message.result) {
      texts.push(message.result.display);
    }
  }

  return texts;
}

/**
 * Resolves the named types referenced by a Workflow's signature and message
 * surface to their owning project modules, so generated declaration files can
 * import source-owned types instead of erasing them.
 */
export function collectTypeImportDependencies(
  root: string,
  sourceFile: SourceFile,
  workflow: Pick<WorkflowDefinition, 'signature'>,
  signals: SignalDefinition[],
  queries: QueryDefinition[],
  updates: UpdateDefinition[],
): WorkflowDependency[] {
  const displayTexts = collectDisplayTexts(workflow, signals, queries, updates);
  const dependencies = new Map<string, WorkflowDependency>();

  for (const candidate of collectNamedTypeSources(root, sourceFile)) {
    const pattern = new RegExp(`\\b${candidate.name}\\b`, 'u');

    if (displayTexts.some((text) => pattern.test(text))) {
      dependencies.set(candidate.name, {
        kind: 'type-import',
        name: candidate.name,
        module: candidate.module,
      });
    }
  }

  return [...dependencies.values()].toSorted((left, right) => left.name.localeCompare(right.name));
}
