import type {
  Diagnostic,
  ExecutionOverlayDocument,
  RuntimeNodeMapping,
  RuntimeTraceDocument,
  StaticOverlayNode,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { getCommandsOfKind } from './mappings';

const commandNodeKinds = ['activity', 'timer', 'condition'] as const;

/** Builds the static node list (workflow, commands, signals) with observed flags. */
export function createStaticNodes(
  workflow: WorkflowDefinition,
  mappings: RuntimeNodeMapping[],
): StaticOverlayNode[] {
  const observed = new Set(mappings.flatMap((mapping) => mapping.staticNodeId ?? []));
  const nodes: StaticOverlayNode[] = [
    {
      id: workflow.id,
      kind: 'workflow',
      name: workflow.name,
      observed: observed.has(workflow.id),
      source: workflow.source,
    },
  ];

  for (const kind of commandNodeKinds) {
    for (const command of getCommandsOfKind(workflow, kind)) {
      nodes.push({
        id: command.id,
        kind,
        name: command.name,
        observed: observed.has(command.id),
        source: command.source,
      });
    }
  }

  for (const signal of workflow.messageSurface.signals) {
    nodes.push({
      id: signal.id,
      kind: 'signal',
      name: signal.name,
      observed: observed.has(signal.id),
      source: signal.source,
    });
  }

  return nodes;
}

/** Emits a warning diagnostic for every runtime operation without a static node. */
export function createDiagnostics(mappings: RuntimeNodeMapping[]): Diagnostic[] {
  return mappings
    .filter((mapping) => !mapping.staticNodeId)
    .map((mapping) => ({
      code: 'TEM_UNMAPPED_RUNTIME_OPERATION',
      category: 'mapping',
      severity: 'warning',
      message: mapping.reason,
      confidence: mapping.confidence,
    }));
}

function isActivityOperation(
  operation: RuntimeTraceDocument['operations'][number],
): operation is Extract<RuntimeTraceDocument['operations'][number], { kind: 'activity' }> {
  return operation.kind === 'activity';
}

function createMessageCoverage(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument,
): ExecutionOverlayDocument['coverage']['messages'] {
  const receivedSignals = [
    ...new Set(
      trace.operations
        .filter((operation) => operation.kind === 'signal')
        .map((operation) => operation.signalName),
    ),
  ].toSorted((left, right) => left.localeCompare(right));

  return {
    staticSignals: workflow.messageSurface.signals.length,
    receivedSignals,
    staticUpdates: 0,
    receivedUpdates: [],
    staticQueries: 0,
  };
}

function createTimerCoverage(
  workflow: WorkflowDefinition,
  trace: RuntimeTraceDocument,
): ExecutionOverlayDocument['coverage']['timers'] {
  const timerOperations = trace.operations.filter((operation) => operation.kind === 'timer');

  return {
    staticTotal: getCommandsOfKind(workflow, 'timer').length,
    fired: timerOperations.filter((operation) => operation.status === 'fired').length,
    canceled: timerOperations.filter((operation) => operation.status === 'canceled').length,
    pending: timerOperations.filter((operation) => operation.status === 'pending').length,
  };
}

/** Computes node, Activity, message, and timer coverage for an overlay. */
export function createCoverage(
  workflow: WorkflowDefinition,
  staticNodes: StaticOverlayNode[],
  mappings: RuntimeNodeMapping[],
  trace: RuntimeTraceDocument,
): ExecutionOverlayDocument['coverage'] {
  const activityOperations = trace.operations.filter(isActivityOperation);
  const observedActivityIds = new Set(
    staticNodes.filter((node) => node.kind === 'activity' && node.observed).map((node) => node.id),
  );

  return {
    nodes: {
      total: staticNodes.length,
      observed: staticNodes.filter((node) => node.observed).length,
      skipped: staticNodes.filter((node) => !node.observed).length,
      unmappedRuntimeOperations: mappings.filter((mapping) => !mapping.staticNodeId).length,
    },
    activities: {
      staticTotal: staticNodes.filter((node) => node.kind === 'activity').length,
      observed: observedActivityIds.size,
      retried: activityOperations.filter((operation) => operation.attempts.length > 1).length,
      failed: activityOperations.filter((operation) => operation.status !== 'completed').length,
    },
    messages: createMessageCoverage(workflow, trace),
    timers: createTimerCoverage(workflow, trace),
  };
}
