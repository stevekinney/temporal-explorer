import {
  Node,
  SyntaxKind,
  type FunctionDeclaration,
  type Project,
  type SourceFile,
} from 'ts-morph';

import type {
  ActivityDefinition,
  Diagnostic,
  SourceLocation,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { analyzeQueryHandler, analyzeUpdateValidator } from './handler-diagnostics';
import { createSourceLocation } from './paths';
import { findActivityProxyVariables, isNamedImportFrom, temporalWorkerModule } from './symbols';
import { createTypeShape } from './type-shapes';
import { collectTemporalCommands } from './workflow-commands';
import {
  createQueryDefinition,
  createUpdateDefinition,
  findMessageDeclarations,
  findMessageRegistrations,
  type MessageRegistration,
} from './workflow-messages';
import { findSignalDeclarations, findSignalRegistrations } from './workflow-signals';

function findNamespaceImportSource(sourceFile: SourceFile): SourceFile | undefined {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    if (!importDeclaration.getNamespaceImport()) {
      continue;
    }

    const moduleSourceFile = importDeclaration.getModuleSpecifierSourceFile();

    if (moduleSourceFile) return moduleSourceFile;
  }

  return undefined;
}

function findActivityImplementationSource(
  activitySourceFile: SourceFile | undefined,
  activityName: string,
  root: string,
): SourceLocation | undefined {
  const declaration = activitySourceFile?.getFunction(activityName);

  if (!declaration || !activitySourceFile) {
    return undefined;
  }

  return createSourceLocation(root, activitySourceFile, declaration, activityName);
}

function getFunctionReturnDisplay(functionDeclaration: FunctionDeclaration): string {
  return (
    functionDeclaration.getReturnTypeNode()?.getText() ??
    functionDeclaration.getReturnType().getText(functionDeclaration)
  );
}

function createWorkflowSignature(root: string, functionDeclaration: FunctionDeclaration) {
  const sourceFile = functionDeclaration.getSourceFile();
  const args = functionDeclaration.getParameters().map((parameter, index) => {
    const name = parameter.getName();
    const display = parameter.getTypeNode()?.getText() ?? parameter.getType().getText(parameter);

    return createTypeShape(
      `${functionDeclaration.getName() ?? 'anonymous'}:arg:${index}:${name}`,
      display,
      createSourceLocation(root, sourceFile, parameter, name),
      name,
    );
  });

  return {
    args,
    result: createTypeShape(
      `${functionDeclaration.getName() ?? 'anonymous'}:result`,
      getFunctionReturnDisplay(functionDeclaration),
    ),
  };
}

function analyzeMessageHandlers(
  root: string,
  registrations: MessageRegistration[],
  proxyVariables: Set<string>,
): Diagnostic[] {
  return registrations.flatMap((registration) =>
    registration.declared.kind === 'query'
      ? analyzeQueryHandler(root, registration.declared.name, registration.handler, proxyVariables)
      : analyzeUpdateValidator(root, registration.declared.name, registration.validator),
  );
}

function analyzeWorkflowFunction(
  root: string,
  functionDeclaration: FunctionDeclaration,
  proxyVariables: Set<string>,
): WorkflowDefinition {
  const workflowName = functionDeclaration.getName() ?? 'anonymousWorkflow';
  const collected = collectTemporalCommands(
    root,
    workflowName,
    functionDeclaration,
    proxyVariables,
  );
  const signals = findSignalRegistrations(
    root,
    workflowName,
    functionDeclaration,
    findSignalDeclarations(root, functionDeclaration.getSourceFile()),
  );
  const registrations = findMessageRegistrations(
    functionDeclaration,
    findMessageDeclarations(root, functionDeclaration.getSourceFile()),
  );
  const queries = registrations
    .filter((registration) => registration.declared.kind === 'query')
    .map((registration) => createQueryDefinition(root, workflowName, registration))
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const updates = registrations
    .filter((registration) => registration.declared.kind === 'update')
    .map((registration) => createUpdateDefinition(root, workflowName, registration))
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const diagnostics = [
    ...collected.diagnostics,
    ...analyzeMessageHandlers(root, registrations, proxyVariables),
  ];

  return {
    id: `workflow:${workflowName}`,
    name: workflowName,
    source: createSourceLocation(
      root,
      functionDeclaration.getSourceFile(),
      functionDeclaration,
      workflowName,
    ),
    exported: functionDeclaration.isExported(),
    signature: createWorkflowSignature(root, functionDeclaration),
    messageSurface: {
      signals,
      queries,
      updates,
    },
    state: {
      variables: [],
    },
    body: {
      nodes: [],
    },
    temporalCommands: collected.commands,
    dependencies: [],
    diagnostics,
  };
}

function analyzeActivities(
  root: string,
  workflow: WorkflowDefinition,
  activitySourceFile?: SourceFile,
): ActivityDefinition[] {
  return workflow.temporalCommands
    .filter((command) => command.kind === 'activity')
    .map((command) => {
      const implementationSource = findActivityImplementationSource(
        activitySourceFile,
        command.name,
        root,
      );

      return {
        id: `activity:${command.name}`,
        name: command.name,
        source: command.source,
        ...(implementationSource ? { implementationSource } : {}),
        confidence: implementationSource ? 'exact' : 'inferred',
      };
    });
}

export function analyzeWorkerFiles(project: Project, root: string): unknown[] {
  const workers: unknown[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getFilePath().includes('/worker')) {
      continue;
    }

    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      const receiver = Node.isPropertyAccessExpression(expression)
        ? expression.getExpression()
        : undefined;

      if (
        !Node.isPropertyAccessExpression(expression) ||
        expression.getName() !== 'create' ||
        !Node.isIdentifier(receiver) ||
        !isNamedImportFrom(receiver, temporalWorkerModule, 'Worker')
      ) {
        continue;
      }

      workers.push({
        id: `worker:${workers.length}`,
        source: createSourceLocation(root, sourceFile, call, 'Worker.create'),
        confidence: 'inferred',
      });
    }
  }

  return workers;
}

export function analyzeWorkflowSourceFile(
  root: string,
  sourceFile: SourceFile,
): {
  workflows: WorkflowDefinition[];
  activities: ActivityDefinition[];
  diagnostics: Diagnostic[];
} {
  const workflows: WorkflowDefinition[] = [];
  const activities: ActivityDefinition[] = [];
  const diagnostics: Diagnostic[] = [];
  const proxyVariables = findActivityProxyVariables(sourceFile);
  const activitySourceFile = findNamespaceImportSource(sourceFile);

  for (const functionDeclaration of sourceFile.getFunctions()) {
    if (!functionDeclaration.isExported()) {
      continue;
    }

    const workflow = analyzeWorkflowFunction(root, functionDeclaration, proxyVariables);
    workflows.push(workflow);
    activities.push(...analyzeActivities(root, workflow, activitySourceFile));
    diagnostics.push(...workflow.diagnostics);
  }

  return { workflows, activities, diagnostics };
}
