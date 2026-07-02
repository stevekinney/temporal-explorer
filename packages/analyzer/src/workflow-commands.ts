import {
  Node,
  SyntaxKind,
  type CallExpression,
  type ElementAccessExpression,
  type FunctionDeclaration,
  type PropertyAccessExpression,
} from 'ts-morph';

import type { Diagnostic, TemporalCommand } from '@temporal-explorer/schemas';

import {
  createActivityCommand,
  createCancellationScopeCommand,
  createChildWorkflowCommand,
  createConditionCommands,
  createContinueAsNewCommand,
  createDynamicCommand,
  createExternalSignalCommand,
  createPatchCommand,
  createSleepCommand,
} from './command-factories';
import { createSourceLocation } from './paths';
import { isNamedImportFrom, isWorkflowModuleCall, temporalWorkflowModule } from './symbols';
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

/** Finds variables holding external Workflow handles from getExternalWorkflowHandle. */
function findExternalHandleVariables(functionDeclaration: FunctionDeclaration): Set<string> {
  const handles = new Set<string>();

  for (const declaration of functionDeclaration.getDescendantsOfKind(
    SyntaxKind.VariableDeclaration,
  )) {
    const initializer = declaration.getInitializer();
    const nameNode = declaration.getNameNode();

    if (
      initializer &&
      Node.isCallExpression(initializer) &&
      isWorkflowModuleCall(initializer, 'getExternalWorkflowHandle') &&
      Node.isIdentifier(nameNode)
    ) {
      handles.add(nameNode.getText());
    }
  }

  return handles;
}

function getCancellationScopeKind(call: CallExpression): string | undefined {
  const expression = call.getExpression();

  if (!Node.isPropertyAccessExpression(expression)) {
    return undefined;
  }

  const receiver = expression.getExpression();

  if (
    !Node.isIdentifier(receiver) ||
    !isNamedImportFrom(receiver, temporalWorkflowModule, 'CancellationScope')
  ) {
    return undefined;
  }

  return expression.getName();
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

type WalkContext = {
  root: string;
  workflowName: string;
  proxyVariables: Set<string>;
  externalHandles: Set<string>;
  signalNamesByVariable: Map<string, string>;
  commands: TemporalCommand[];
  diagnostics: Diagnostic[];
};

function collectCall(call: CallExpression, context: WalkContext): void {
  const { root, workflowName, commands } = context;
  const proxyAccess = getProxyPropertyAccessExpression(call, context.proxyVariables);

  if (proxyAccess) {
    commands.push(
      createActivityCommand(root, workflowName, proxyAccess.getName(), call, commands.length),
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

  collectWorkflowModuleCall(call, context);
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
  } else if (
    isWorkflowModuleCall(call, 'patched') ||
    isWorkflowModuleCall(call, 'deprecatePatch')
  ) {
    commands.push(createPatchCommand(root, workflowName, call, commands.length));
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
    externalHandles: findExternalHandleVariables(functionDeclaration),
    signalNamesByVariable,
    commands: [],
    diagnostics: [],
  };

  for (const call of functionDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    collectCall(call, context);
  }

  return { commands: context.commands, diagnostics: context.diagnostics };
}
