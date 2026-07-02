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

  return 'Unmapped history operation';
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

export function confidenceForOperationIds(
  runtimeOperationIds: string[],
  mappingsByRuntimeOperationId: Map<string, RuntimeNodeMapping>,
): RuntimeNodeMapping['confidence'] | 'unknown' {
  const confidences = runtimeOperationIds.flatMap((operationId) => {
    const mapping = mappingsByRuntimeOperationId.get(operationId);
    return mapping ? [mapping.confidence] : [];
  });

  if (confidences.includes('ambiguous')) return 'ambiguous';
  if (confidences.includes('inferred')) return 'inferred';
  if (confidences.includes('unknown')) return 'unknown';
  if (confidences.includes('exact')) return 'exact';

  return 'unknown';
}

export function createStatusCounts(nodes: TemporalGraphNode[]): Map<RuntimeOverlayState, number> {
  return new Map(
    runtimeOverlayStates.map((state) => [
      state,
      nodes.filter((node) => node.state === state).length,
    ]),
  );
}
