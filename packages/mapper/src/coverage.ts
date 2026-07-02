import type {
  Diagnostic,
  ExecutionOverlayDocument,
  RuntimeNodeMapping,
  RuntimeTraceDocument,
  StaticOverlayNode,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { getCommandsOfKind } from './mappings';

const commandNodeKinds = [
  'activity',
  'timer',
  'condition',
  'child-workflow',
  'external-workflow',
  'continue-as-new',
  'patch',
  'cancellation-scope',
  'dynamic',
] as const;

const messageNodeKinds = [
  { surface: 'signals', kind: 'signal' },
  { surface: 'queries', kind: 'query' },
  { surface: 'updates', kind: 'update' },
] as const;

/**
 * Marks cancellation scopes observed when any observed command's source range
 * is contained within the scope's source range. Scopes have no direct history
 * events, so containment is the honest inference.
 */
function markObservedScopes(nodes: StaticOverlayNode[]): void {
  const observedSources = nodes
    .filter((node) => node.observed && node.kind !== 'cancellation-scope' && node.source)
    .map((node) => node.source);

  for (const node of nodes) {
    if (node.kind !== 'cancellation-scope' || node.observed || !node.source) {
      continue;
    }

    const scope = node.source;
    node.observed = observedSources.some(
      (candidate) =>
        candidate !== undefined &&
        candidate.path === scope.path &&
        candidate.start.offset >= scope.start.offset &&
        candidate.end.offset <= scope.end.offset,
    );
  }
}

/** Builds the static node list (workflow, commands, messages) with observed flags. */
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

  for (const { surface, kind } of messageNodeKinds) {
    for (const message of workflow.messageSurface[surface]) {
      nodes.push({
        id: message.id,
        kind,
        name: message.name,
        observed: observed.has(message.id),
        source: message.source,
      });
    }
  }

  markObservedScopes(nodes);
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
  const receivedUpdates = [
    ...new Set(
      trace.operations
        .filter((operation) => operation.kind === 'update')
        .map((operation) => operation.updateName),
    ),
  ].toSorted((left, right) => left.localeCompare(right));

  return {
    staticSignals: workflow.messageSurface.signals.length,
    receivedSignals,
    staticUpdates: workflow.messageSurface.updates.length,
    receivedUpdates,
    staticQueries: workflow.messageSurface.queries.length,
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
      // Temporal collapses server-side retries into one started event whose
      // attempt number carries the true count.
      retried: activityOperations.filter(
        (operation) =>
          operation.attempts.length > 1 ||
          operation.attempts.some((attempt) => attempt.attempt > 1),
      ).length,
      failed: activityOperations.filter((operation) => operation.status !== 'completed').length,
    },
    messages: createMessageCoverage(workflow, trace),
    timers: createTimerCoverage(workflow, trace),
  };
}
