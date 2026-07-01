import { describe, expect, it } from 'bun:test';

import {
  type RuntimeOperation,
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
  validateArtifact,
} from '@temporal-explorer/schemas';

import { createExecutionOverlay, createOverlayReport } from './index';

const analysisFile = new URL(
  '../../../fixtures/basic-order/.temporal-explorer/analysis.json',
  import.meta.url,
);
const traceFile = new URL(
  '../../../fixtures/basic-order/.temporal-explorer/histories/success.trace.json',
  import.meta.url,
);

function isActivityOperation(
  operation: RuntimeOperation,
): operation is Extract<RuntimeOperation, { kind: 'activity' }> {
  return operation.kind === 'activity';
}

describe('source-aware execution mapper', () => {
  it('maps the basic order trace to static Activity commands with evidence', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(await Bun.file(analysisFile).json());
    const trace = runtimeTraceDocumentSchema.parse(await Bun.file(traceFile).json());
    const overlay = createExecutionOverlay({
      analysis,
      trace,
      workflowName: 'basicOrderWorkflow',
    });
    const activityMappings = overlay.mappings.filter((mapping) =>
      mapping.staticNodeId?.startsWith('activity-call:'),
    );

    expect(validateArtifact(overlay).success).toBe(true);
    expect(activityMappings).toHaveLength(3);
    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(0);
    expect(overlay.staticNodes.every((node) => node.observed)).toBe(true);
    expect(
      activityMappings.every((mapping) =>
        mapping.evidence.some((evidence) => evidence.kind === 'command-order'),
      ),
    ).toBe(true);
    expect(createOverlayReport(overlay)).toContain(
      'validateOrder (observed) -> src/workflows/basic-order-workflow.ts:17 [exact]',
    );
  });

  it('reports missing workflows and unobserved static Activity nodes', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(await Bun.file(analysisFile).json());
    const trace = runtimeTraceDocumentSchema.parse(await Bun.file(traceFile).json());
    const workflowOnlyTrace = {
      ...trace,
      operations: trace.operations.filter((operation) => operation.kind === 'workflow-lifecycle'),
    };

    expect(() =>
      createExecutionOverlay({
        analysis,
        trace,
        workflowName: 'missingWorkflow',
      }),
    ).toThrow('Workflow "missingWorkflow" was not found in static analysis.');

    const overlay = createExecutionOverlay({
      analysis,
      trace: workflowOnlyTrace,
      workflowName: 'basicOrderWorkflow',
    });

    expect(overlay.coverage.nodes.skipped).toBe(3);
    expect(createOverlayReport(overlay)).toContain(
      'validateOrder (not observed) -> src/workflows/basic-order-workflow.ts:17 [unknown]',
    );
  });

  it('diagnoses unsupported and unmatched runtime operations', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(await Bun.file(analysisFile).json());
    const trace = runtimeTraceDocumentSchema.parse(await Bun.file(traceFile).json());
    const firstActivity = trace.operations.find(isActivityOperation);

    if (!firstActivity) {
      throw new Error('Expected an Activity operation fixture.');
    }

    const unsupportedOperation: RuntimeOperation = {
      id: 'unmapped:signal:99',
      kind: 'unmapped',
      eventReferences: [{ eventId: 99, eventType: 'SignalReceived' }],
      reason: 'Signal operation support is outside the MVP slice.',
    };
    const unmatchedActivity: RuntimeOperation = {
      ...firstActivity,
      id: 'activity:refundOrder:100',
      activityType: 'refundOrder',
      activityId: 'refund-order',
      eventReferences: [{ eventId: 100, eventType: 'ActivityTaskScheduled' }],
    };
    const overlay = createExecutionOverlay({
      analysis,
      trace: {
        ...trace,
        operations: [...trace.operations, unsupportedOperation, unmatchedActivity],
      },
      workflowName: 'basicOrderWorkflow',
    });

    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(2);
    expect(overlay.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Runtime operation unmapped:signal:99 is not supported yet.',
      'No static Activity command matched refundOrder occurrence 1.',
    ]);
  });
});
