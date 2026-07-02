import {
  Node,
  SyntaxKind,
  type CallExpression,
  type ElementAccessExpression,
  type FunctionDeclaration,
  type PropertyAccessExpression,
} from 'ts-morph';

import type { Diagnostic, TemporalCommand } from '@temporal-explorer/schemas';

import { createSourceLocation } from './paths';
import { isWorkflowModuleCall } from './symbols';

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

function createConditionCommands(
  root: string,
  workflowName: string,
  call: CallExpression,
  startOrder: number,
): TemporalCommand[] {
  const [predicate, timeout] = call.getArguments();
  const predicateText = predicate?.getText() ?? 'condition';
  const commands: TemporalCommand[] = [
    {
      id: `condition:${workflowName}:${startOrder}`,
      kind: 'condition',
      name: predicateText,
      source: createSourceLocation(root, call.getSourceFile(), call),
      confidence: 'exact',
      staticOrder: startOrder,
    },
  ];

  if (timeout) {
    // A condition timeout starts a durable timer that appears in Event History
    // as TimerStarted plus TimerFired or TimerCanceled.
    commands.push({
      id: `timer:${workflowName}:${startOrder + 1}`,
      kind: 'timer',
      name: timeout.getText(),
      source: createSourceLocation(root, call.getSourceFile(), call),
      confidence: 'exact',
      staticOrder: startOrder + 1,
    });
  }

  return commands;
}

function createSleepCommand(
  root: string,
  workflowName: string,
  call: CallExpression,
  order: number,
): TemporalCommand {
  const duration = call.getArguments()[0]?.getText() ?? 'sleep';

  return {
    id: `timer:${workflowName}:${order}`,
    kind: 'timer',
    name: duration,
    source: createSourceLocation(root, call.getSourceFile(), call),
    confidence: 'exact',
    staticOrder: order,
  };
}

/**
 * Collects Temporal commands (Activity calls, conditions, timers) from one
 * Workflow function in source order, with diagnostics for dynamic dispatch.
 */
export function collectTemporalCommands(
  root: string,
  workflowName: string,
  functionDeclaration: FunctionDeclaration,
  proxyVariables: Set<string>,
): CollectedCommands {
  const commands: TemporalCommand[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const call of functionDeclaration.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const proxyAccess = getProxyPropertyAccessExpression(call, proxyVariables);

    if (proxyAccess) {
      commands.push(createActivityCommand(root, workflowName, proxyAccess, call, commands.length));
      continue;
    }

    if (isWorkflowModuleCall(call, 'condition')) {
      commands.push(...createConditionCommands(root, workflowName, call, commands.length));
      continue;
    }

    if (isWorkflowModuleCall(call, 'sleep')) {
      commands.push(createSleepCommand(root, workflowName, call, commands.length));
      continue;
    }

    const expression = call.getExpression();

    if (Node.isElementAccessExpression(expression)) {
      const receiver = expression.getExpression();

      if (Node.isIdentifier(receiver) && proxyVariables.has(receiver.getText())) {
        diagnostics.push(createDynamicActivityDiagnostic(root, call, expression));
      }
    }
  }

  return { commands, diagnostics };
}
