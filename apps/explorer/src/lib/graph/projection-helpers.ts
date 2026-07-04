import type {
  EventReference,
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

import type { RuntimeOverlayState, TemporalGraphNode } from './projection';
import { runtimeOverlayStates } from './runtime-state';

export function findWorkflowRuntimeOperations(
  trace: RuntimeTraceDocument | undefined,
): RuntimeOperation[] {
  return trace?.operations.filter((operation) => operation.kind === 'workflow-lifecycle') ?? [];
}

export function operationLabel(operation: RuntimeOperation): string {
  if (operation.kind === 'activity') {
    return operation.activityType;
  }

  if (operation.kind === 'workflow-lifecycle') {
    return `Workflow ${operation.status}`;
  }

  if (operation.kind === 'signal') {
    return `Signal ${operation.signalName}`;
  }

  if (operation.kind === 'timer') {
    return `Timer ${operation.timerId}`;
  }

  return extendedOperationLabel(operation) ?? 'Unmapped history operation';
}

function extendedOperationLabel(
  operation: Exclude<
    RuntimeOperation,
    { kind: 'activity' | 'workflow-lifecycle' | 'signal' | 'timer' }
  >,
): string | undefined {
  if (operation.kind === 'update') return `Update ${operation.updateName}`;
  if (operation.kind === 'child-workflow') return `Child workflow ${operation.workflowType}`;
  if (operation.kind === 'external-signal') return `External signal ${operation.signalName}`;
  if (operation.kind === 'marker') return `Patch ${operation.patchId ?? operation.markerName}`;
  if (operation.kind === 'continue-as-new') return 'Continue as new';
  if (operation.kind === 'cancel-request') return 'Cancellation requested';

  return undefined; // unmapped
}

export function operationEventReferences(
  operation: RuntimeOperation | undefined,
): EventReference[] {
  return operation?.eventReferences ?? [];
}

export function runtimeOperationIdsForNode(
  staticNodeId: string,
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>,
): string[] {
  return Array.from(mappingsByRuntimeOperationId.entries())
    .filter(([, mapping]) => mapping.staticNodeId === staticNodeId)
    .map(([runtimeOperationId]) => runtimeOperationId);
}

export function eventReferencesForOperationIds(
  runtimeOperationIds: string[],
  operationsById: Map<string, RuntimeOperation>,
): EventReference[] {
  return runtimeOperationIds.flatMap((operationId) =>
    operationEventReferences(operationsById.get(operationId)),
  );
}

/** Worst-first: the first of these present across mapped operations wins. */
const confidencePriority: RuntimeNodeMapping['confidence'][] = [
  'ambiguous',
  'dynamic',
  'inferred',
  'partial',
  'unknown',
  'exact',
];

export function confidenceForOperationIds(
  runtimeOperationIds: string[],
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>,
): RuntimeNodeMapping['confidence'] | 'unknown' {
  const confidences = runtimeOperationIds.flatMap((operationId) => {
    const mapping = mappingsByRuntimeOperationId.get(operationId);
    return mapping ? [mapping.confidence] : [];
  });

  return confidencePriority.find((candidate) => confidences.includes(candidate)) ?? 'unknown';
}

const STRUCTURAL_KINDS = new Set<TemporalGraphNode['kind']>([
  'branch-region',
  'loop-region',
  'parallel-region',
  'try-region',
  'decision',
  'parallel-fork',
  'join',
  'terminal',
]);

/** True for structural control-flow nodes (region containers and markers), which bear no runtime state. */
export function isStructuralNode(node: TemporalGraphNode): boolean {
  return Boolean(node.isContainer) || STRUCTURAL_KINDS.has(node.kind);
}

/** Counts nodes by runtime state for the status legend, excluding structural control-flow nodes. */
export function createStatusCounts(nodes: TemporalGraphNode[]): Map<RuntimeOverlayState, number> {
  const runtimeNodes = nodes.filter((node) => !isStructuralNode(node));

  return new Map(
    runtimeOverlayStates.map((state) => [
      state,
      runtimeNodes.filter((node) => node.state === state).length,
    ]),
  );
}
