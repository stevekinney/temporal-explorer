import { Node, type CallExpression } from 'ts-morph';

import type { TemporalCommand } from '@temporal-explorer/schemas';

import { createSourceLocation } from './paths';

function commandSource(root: string, call: CallExpression, symbolName?: string) {
  return createSourceLocation(root, call.getSourceFile(), call, symbolName);
}

/** Creates an Activity call command from a proxy property access. */
export function createActivityCommand(
  root: string,
  workflowName: string,
  activityName: string,
  call: CallExpression,
  order: number,
): TemporalCommand {
  return {
    id: `activity-call:${workflowName}:${activityName}:${order}`,
    kind: 'activity',
    name: activityName,
    source: commandSource(root, call, activityName),
    confidence: 'exact',
    staticOrder: order,
  };
}

/** Creates condition plus implicit timeout-timer commands for a condition call. */
export function createConditionCommands(
  root: string,
  workflowName: string,
  call: CallExpression,
  startOrder: number,
): TemporalCommand[] {
  const [predicate, timeout] = call.getArguments();
  const commands: TemporalCommand[] = [
    {
      id: `condition:${workflowName}:${startOrder}`,
      kind: 'condition',
      name: predicate?.getText() ?? 'condition',
      source: commandSource(root, call),
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
      source: commandSource(root, call),
      confidence: 'exact',
      staticOrder: startOrder + 1,
    });
  }

  return commands;
}

/** Creates a timer command for a sleep call. */
export function createSleepCommand(
  root: string,
  workflowName: string,
  call: CallExpression,
  order: number,
): TemporalCommand {
  return {
    id: `timer:${workflowName}:${order}`,
    kind: 'timer',
    name: call.getArguments()[0]?.getText() ?? 'sleep',
    source: commandSource(root, call),
    confidence: 'exact',
    staticOrder: order,
  };
}

function resolveChildWorkflowTarget(target: Node | undefined): {
  name: string;
  confidence: TemporalCommand['confidence'];
} {
  if (target && Node.isStringLiteral(target)) {
    return { name: target.getLiteralValue(), confidence: 'exact' };
  }

  if (target && Node.isIdentifier(target)) {
    return { name: target.getText(), confidence: 'exact' };
  }

  return { name: target?.getText() || 'unknownChildWorkflow', confidence: 'dynamic' };
}

/** Creates a child Workflow command for startChild or executeChild. */
export function createChildWorkflowCommand(
  root: string,
  workflowName: string,
  call: CallExpression,
  order: number,
): TemporalCommand {
  const { name, confidence } = resolveChildWorkflowTarget(call.getArguments()[0]);

  return {
    id: `child-workflow:${workflowName}:${name}:${order}`,
    kind: 'child-workflow',
    name,
    source: commandSource(root, call, name),
    confidence,
    staticOrder: order,
  };
}

/** Creates an external Workflow command for a call on an external handle. */
export function createExternalSignalCommand(
  root: string,
  workflowName: string,
  signalName: string,
  confidence: TemporalCommand['confidence'],
  call: CallExpression,
  order: number,
): TemporalCommand {
  return {
    id: `external-workflow:${workflowName}:${signalName}:${order}`,
    kind: 'external-workflow',
    name: signalName,
    source: commandSource(root, call, signalName),
    confidence,
    staticOrder: order,
  };
}

/** Creates a continue-as-new command. */
export function createContinueAsNewCommand(
  root: string,
  workflowName: string,
  call: CallExpression,
  order: number,
): TemporalCommand {
  const typeArgument = call.getTypeArguments()[0]?.getText();
  const target = typeArgument?.startsWith('typeof ')
    ? typeArgument.slice('typeof '.length)
    : typeArgument;

  return {
    id: `continue-as-new:${workflowName}:${order}`,
    kind: 'continue-as-new',
    name: target ?? 'continueAsNew',
    source: commandSource(root, call),
    confidence: 'exact',
    staticOrder: order,
  };
}

/** Creates a patch command for patched or deprecatePatch (`deprecated` marks the latter). */
export function createPatchCommand(
  root: string,
  workflowName: string,
  call: CallExpression,
  order: number,
  deprecated: boolean,
): TemporalCommand {
  const [patchArgument] = call.getArguments();
  const literalId =
    patchArgument && Node.isStringLiteral(patchArgument)
      ? patchArgument.getLiteralValue()
      : undefined;

  return {
    id: `patch:${workflowName}:${order}`,
    kind: 'patch',
    name: literalId ?? (patchArgument?.getText() || 'unknownPatch'),
    source: commandSource(root, call),
    confidence: literalId ? 'exact' : 'dynamic',
    staticOrder: order,
    ...(deprecated ? { deprecated: true } : {}),
  };
}

/** Creates a cancellation scope command for CancellationScope methods. */
export function createCancellationScopeCommand(
  root: string,
  workflowName: string,
  scopeKind: string,
  call: CallExpression,
  order: number,
): TemporalCommand {
  return {
    id: `cancellation-scope:${workflowName}:${order}`,
    kind: 'cancellation-scope',
    name: scopeKind,
    source: commandSource(root, call),
    confidence: 'exact',
    staticOrder: order,
  };
}

/** Creates a Nexus operation command for client.executeOperation / startOperation. */
export function createNexusOperationCommand(
  root: string,
  workflowName: string,
  operationName: string,
  confidence: TemporalCommand['confidence'],
  call: CallExpression,
  order: number,
): TemporalCommand {
  return {
    id: `nexus-operation:${workflowName}:${operationName}:${order}`,
    kind: 'nexus-operation',
    name: operationName,
    source: commandSource(root, call, operationName),
    confidence,
    staticOrder: order,
  };
}

/** Creates a search-attribute command for upsertSearchAttributes / upsertMemo. */
export function createSearchAttributeCommand(
  root: string,
  workflowName: string,
  methodName: string,
  call: CallExpression,
  order: number,
): TemporalCommand {
  return {
    id: `search-attribute:${workflowName}:${order}`,
    kind: 'search-attribute',
    name: methodName,
    source: commandSource(root, call),
    confidence: 'exact',
    staticOrder: order,
  };
}

/** Creates a dynamic dispatch command for unresolvable Activity access. */
export function createDynamicCommand(
  root: string,
  workflowName: string,
  expressionText: string,
  call: CallExpression,
  order: number,
): TemporalCommand {
  return {
    id: `dynamic:${workflowName}:${order}`,
    kind: 'dynamic',
    name: expressionText,
    source: commandSource(root, call),
    confidence: 'dynamic',
    staticOrder: order,
  };
}
