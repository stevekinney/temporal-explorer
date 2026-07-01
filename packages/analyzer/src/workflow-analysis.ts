import {
  Node,
  Project,
  SyntaxKind,
  type CallExpression,
  type ElementAccessExpression,
  type FunctionDeclaration,
  type PropertyAccessExpression,
  type SourceFile,
} from 'ts-morph';

import type {
  ActivityDefinition,
  Diagnostic,
  SourceLocation,
  TemporalCommand,
  TypeShape,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { createSourceLocation } from './paths';
import { findActivityProxyVariables, isNamedImportFrom, temporalWorkerModule } from './symbols';

function createTypeShape(
  id: string,
  display: string,
  source?: SourceLocation,
  displayName?: string,
): TypeShape {
  return {
    id,
    display,
    ...(displayName ? { displayName } : {}),
    kind: display === 'void' ? 'primitive' : 'external',
    ...(source ? { source } : {}),
    confidence: display === 'unknown' ? 'unknown' : 'exact',
  };
}

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

function createActivityCommand(
  root: string,
  workflowName: string,
  expression: PropertyAccessExpression,
  call: CallExpression,
  order: number,
): TemporalCommand {
  const activityName = expression.getName();

  return {
    id: `activity-call:${workflowName}:${activityName}:${order}`,
    kind: 'activity',
    name: activityName,
    source: createSourceLocation(root, call.getSourceFile(), call, activityName),
    confidence: 'exact',
    staticOrder: order,
  };
}

function getProxyPropertyAccessExpression(
  call: CallExpression,
  proxyVariables: Set<string>,
): PropertyAccessExpression | undefined {
  const expression = call.getExpression();

  if (!Node.isPropertyAccessExpression(expression)) {
    return undefined;
  }

  const receiver = expression.getExpression();
  return Node.isIdentifier(receiver) && proxyVariables.has(receiver.getText())
    ? expression
    : undefined;
}

function createDynamicActivityDiagnostic(
  root: string,
  call: CallExpression,
  expression: ElementAccessExpression,
): Diagnostic {
  return {
    code: 'TEA_DYNAMIC_ACTIVITY_CALL',
    category: 'control-flow',
    severity: 'warning',
    message: `Dynamic Activity call could not be fully resolved: ${expression.getText()}`,
    source: createSourceLocation(root, call.getSourceFile(), call),
    confidence: 'dynamic',
  };
}

function findDynamicActivityDiagnostics(
  root: string,
  functionDeclaration: FunctionDeclaration,
  proxyVariables: Set<string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const call of functionDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression();

    if (!Node.isElementAccessExpression(expression)) {
      continue;
    }

    const receiver = expression.getExpression();

    if (Node.isIdentifier(receiver) && proxyVariables.has(receiver.getText())) {
      diagnostics.push(createDynamicActivityDiagnostic(root, call, expression));
    }
  }

  return diagnostics;
}

function analyzeWorkflowFunction(
  root: string,
  functionDeclaration: FunctionDeclaration,
  proxyVariables: Set<string>,
): WorkflowDefinition {
  const workflowName = functionDeclaration.getName() ?? 'anonymousWorkflow';
  const activityCommands: TemporalCommand[] = [];

  for (const call of functionDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = getProxyPropertyAccessExpression(call, proxyVariables);

    if (!expression) {
      continue;
    }

    const command = createActivityCommand(
      root,
      workflowName,
      expression,
      call,
      activityCommands.length,
    );
    activityCommands.push(command);
  }

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
      signals: [],
      queries: [],
      updates: [],
    },
    state: {
      variables: [],
    },
    body: {
      nodes: [],
    },
    temporalCommands: activityCommands,
    dependencies: [],
    diagnostics: findDynamicActivityDiagnostics(root, functionDeclaration, proxyVariables),
  };
}

function analyzeActivities(
  root: string,
  workflow: WorkflowDefinition,
  activitySourceFile?: SourceFile,
): ActivityDefinition[] {
  return workflow.temporalCommands.map((command) => {
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
