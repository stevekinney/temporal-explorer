import {
  Node,
  SyntaxKind,
  type CallExpression,
  type ElementAccessExpression,
  type FunctionDeclaration,
  type PropertyAccessExpression,
} from 'ts-morph';

import type { Diagnostic, TemporalCommand } from '@temporal-explorer/schemas';

import { findVariablesInitializedBy, getNexusOperationName } from './command-detection';
import {
  createActivityCommand,
  createCancellationScopeCommand,
  createChildWorkflowCommand,
  createConditionCommands,
  createContinueAsNewCommand,
  createDynamicCommand,
  createExternalSignalCommand,
  createNexusOperationCommand,
  createPatchCommand,
  createSearchAttributeCommand,
  createSleepCommand,
} from './command-factories';
import { collectLocalCalleeCommands } from './interprocedural';
import { createSourceLocation } from './paths';
import {
  findDestructuredActivityBindings,
  isNamedImportFrom,
  isNamespaceImportOf,
  isWorkflowModuleCall,
  temporalWorkflowModule,
  workflowModuleCallName,
} from './symbols';
import { findSignalDeclarations } from './workflow-signals';

export type CollectedCommands = {
  commands: TemporalCommand[];
  diagnostics: Diagnostic[];
};

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

function getDynamicProxyAccess(
  call: CallExpression,
  proxyVariables: Set<string>,
): ElementAccessExpression | undefined {
  const expression = call.getExpression();

  if (!Node.isElementAccessExpression(expression)) {
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

/** Reports whether a receiver refers to `@temporalio/workflow`'s `CancellationScope`, via a named or namespace import. */
function isCancellationScopeReceiver(receiver: Node): boolean {
  // Named import: `CancellationScope.cancellable(...)`.
  if (Node.isIdentifier(receiver)) {
    return isNamedImportFrom(receiver, temporalWorkflowModule, 'CancellationScope');
  }

  // Namespace import: `wf.CancellationScope.cancellable(...)`.
  if (Node.isPropertyAccessExpression(receiver) && receiver.getName() === 'CancellationScope') {
    const namespaceReceiver = receiver.getExpression();

    return (
      Node.isIdentifier(namespaceReceiver) &&
      isNamespaceImportOf(namespaceReceiver, temporalWorkflowModule)
    );
  }

  return false;
}

function getCancellationScopeKind(call: CallExpression): string | undefined {
  const expression = call.getExpression();

  if (!Node.isPropertyAccessExpression(expression)) {
    return undefined;
  }

  return isCancellationScopeReceiver(expression.getExpression()) ? expression.getName() : undefined;
}

function isExternalHandleSignalCall(call: CallExpression, externalHandles: Set<string>): boolean {
  const expression = call.getExpression();

  if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== 'signal') {
    return false;
  }

  const receiver = expression.getExpression();
  return Node.isIdentifier(receiver) && externalHandles.has(receiver.getText());
}

function resolveSignalArgumentName(
  signalArgument: Node | undefined,
  signalNamesByVariable: Map<string, string>,
): { name: string; confidence: TemporalCommand['confidence'] } {
  if (signalArgument && Node.isStringLiteral(signalArgument)) {
    return { name: signalArgument.getLiteralValue(), confidence: 'exact' };
  }

  if (signalArgument && Node.isIdentifier(signalArgument)) {
    const declared = signalNamesByVariable.get(signalArgument.getText());

    if (declared) {
      return { name: declared, confidence: 'exact' };
    }
  }

  return { name: signalArgument?.getText() || 'unknownSignal', confidence: 'dynamic' };
}

function getExternalSignalName(
  call: CallExpression,
  externalHandles: Set<string>,
  signalNamesByVariable: Map<string, string>,
): { name: string; confidence: TemporalCommand['confidence'] } | undefined {
  if (!isExternalHandleSignalCall(call, externalHandles)) {
    return undefined;
  }

  return resolveSignalArgumentName(call.getArguments()[0], signalNamesByVariable);
}

export type WalkContext = {
  root: string;
  workflowName: string;
  proxyVariables: Set<string>;
  destructuredActivities: Map<string, string>;
  externalHandles: Set<string>;
  nexusClients: Set<string>;
  signalNamesByVariable: Map<string, string>;
  commands: TemporalCommand[];
  diagnostics: Diagnostic[];
  /** Interprocedural descent depth; 0 in the Workflow body, 1 inside a walked-into helper. */
  depth: number;
  /** The Workflow function being analyzed, used to skip callees it already walks. */
  workflowFunction: FunctionDeclaration;
};

function getDestructuredActivityName(
  call: CallExpression,
  destructuredActivities: Map<string, string>,
): string | undefined {
  const expression = call.getExpression();
  return Node.isIdentifier(expression)
    ? destructuredActivities.get(expression.getText())
    : undefined;
}

function collectCall(call: CallExpression, context: WalkContext): void {
  const { root, workflowName, commands } = context;
  const proxyAccess = getProxyPropertyAccessExpression(call, context.proxyVariables);

  if (proxyAccess) {
    commands.push(
      createActivityCommand(root, workflowName, proxyAccess.getName(), call, commands.length),
    );
    return;
  }

  const destructuredActivity = getDestructuredActivityName(call, context.destructuredActivities);

  if (destructuredActivity) {
    commands.push(
      createActivityCommand(root, workflowName, destructuredActivity, call, commands.length),
    );
    return;
  }

  const dynamicAccess = getDynamicProxyAccess(call, context.proxyVariables);

  if (dynamicAccess) {
    commands.push(
      createDynamicCommand(root, workflowName, dynamicAccess.getText(), call, commands.length),
    );
    context.diagnostics.push(createDynamicActivityDiagnostic(root, call, dynamicAccess));
    return;
  }

  const scopeKind = getCancellationScopeKind(call);

  if (scopeKind) {
    commands.push(
      createCancellationScopeCommand(root, workflowName, scopeKind, call, commands.length),
    );
    return;
  }

  const externalSignal = getExternalSignalName(
    call,
    context.externalHandles,
    context.signalNamesByVariable,
  );

  if (externalSignal) {
    commands.push(
      createExternalSignalCommand(
        root,
        workflowName,
        externalSignal.name,
        externalSignal.confidence,
        call,
        commands.length,
      ),
    );
    return;
  }

  const nexusOperation = getNexusOperationName(call, context.nexusClients);

  if (nexusOperation) {
    commands.push(
      createNexusOperationCommand(
        root,
        workflowName,
        nexusOperation.name,
        nexusOperation.confidence,
        call,
        commands.length,
      ),
    );
    return;
  }

  collectWorkflowModuleCall(call, context);
  collectLocalCalleeCommands(call, context, collectCall);
}

function collectWorkflowModuleCall(call: CallExpression, context: WalkContext): void {
  const { root, workflowName, commands } = context;

  if (isWorkflowModuleCall(call, 'condition')) {
    commands.push(...createConditionCommands(root, workflowName, call, commands.length));
  } else if (isWorkflowModuleCall(call, 'sleep')) {
    commands.push(createSleepCommand(root, workflowName, call, commands.length));
  } else if (
    isWorkflowModuleCall(call, 'startChild') ||
    isWorkflowModuleCall(call, 'executeChild')
  ) {
    commands.push(createChildWorkflowCommand(root, workflowName, call, commands.length));
  } else if (isWorkflowModuleCall(call, 'continueAsNew')) {
    commands.push(createContinueAsNewCommand(root, workflowName, call, commands.length));
  } else if (isWorkflowModuleCall(call, 'patched')) {
    commands.push(createPatchCommand(root, workflowName, call, commands.length, false));
  } else if (isWorkflowModuleCall(call, 'deprecatePatch')) {
    commands.push(createPatchCommand(root, workflowName, call, commands.length, true));
  } else {
    collectSearchAttributeCall(call, context);
  }
}

const searchAttributeMethods = new Set([
  'upsertSearchAttributes',
  'upsertTypedSearchAttributes',
  'upsertMemo',
]);

function collectSearchAttributeCall(call: CallExpression, context: WalkContext): void {
  const { root, workflowName, commands } = context;
  const methodName = workflowModuleCallName(call);

  if (methodName && searchAttributeMethods.has(methodName)) {
    commands.push(
      createSearchAttributeCommand(root, workflowName, methodName, call, commands.length),
    );
  }
}

/**
 * Collects Temporal commands (Activities, waits, children, external signals,
 * versioning patches, cancellation scopes, dynamic dispatch) from one Workflow
 * function in source order, with diagnostics for dynamic dispatch.
 */
export function collectTemporalCommands(
  root: string,
  workflowName: string,
  functionDeclaration: FunctionDeclaration,
  proxyVariables: Set<string>,
): CollectedCommands {
  const signalNamesByVariable = new Map<string, string>();

  for (const [variableName, declared] of findSignalDeclarations(
    root,
    functionDeclaration.getSourceFile(),
  )) {
    signalNamesByVariable.set(variableName, declared.name);
  }

  const context: WalkContext = {
    root,
    workflowName,
    proxyVariables,
    destructuredActivities: findDestructuredActivityBindings(
      functionDeclaration.getSourceFile(),
      proxyVariables,
    ),
    externalHandles: findVariablesInitializedBy(functionDeclaration, 'getExternalWorkflowHandle'),
    nexusClients: findVariablesInitializedBy(functionDeclaration, 'createNexusServiceClient'),
    signalNamesByVariable,
    commands: [],
    diagnostics: [],
    depth: 0,
    workflowFunction: functionDeclaration,
  };

  for (const call of functionDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    collectCall(call, context);
  }

  return { commands: context.commands, diagnostics: context.diagnostics };
}
