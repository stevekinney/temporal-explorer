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

  it('maps signals and canceled timers for the timer-race signal-wins overlay', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/timer-race/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const trace = runtimeTraceDocumentSchema.parse(
      await Bun.file(
        new URL(
          '../../../fixtures/timer-race/.temporal-explorer/histories/signal-wins.trace.json',
          import.meta.url,
        ),
      ).json(),
    );
    const overlay = createExecutionOverlay({
      analysis,
      trace,
      workflowName: 'timerRaceWorkflow',
    });
    const signalMapping = overlay.mappings.find((mapping) =>
      mapping.staticNodeId?.startsWith('signal:'),
    );
    const timerMapping = overlay.mappings.find((mapping) =>
      mapping.staticNodeId?.startsWith('timer:'),
    );

    expect(validateArtifact(overlay).success).toBe(true);
    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(0);
    expect(signalMapping?.confidence).toBe('exact');
    expect(signalMapping?.evidence.some((evidence) => evidence.kind === 'signal-name')).toBe(true);
    expect(timerMapping?.confidence).toBe('exact');
    expect(timerMapping?.evidence.some((evidence) => evidence.kind === 'timer-order')).toBe(true);
    expect(overlay.coverage.timers).toEqual({
      staticTotal: 1,
      fired: 0,
      canceled: 1,
      pending: 0,
    });
    expect(overlay.staticNodes.find((node) => node.name === 'notifyExpired')?.observed).toBe(false);

    const report = createOverlayReport(overlay);
    expect(report).toContain('Signals');
    expect(report).toContain('Timers');
    expect(report).toContain('notifyExpired (not observed)');
  });

  it('maps cancellation scopes by containment and explains the cleanup path', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/cancellation/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const trace = runtimeTraceDocumentSchema.parse(
      await Bun.file(
        new URL(
          '../../../fixtures/cancellation/.temporal-explorer/histories/canceled.trace.json',
          import.meta.url,
        ),
      ).json(),
    );
    const overlay = createExecutionOverlay({
      analysis,
      trace,
      workflowName: 'cancellationWorkflow',
    });
    const byName = new Map(overlay.staticNodes.map((node) => [node.name, node]));

    expect(validateArtifact(overlay).success).toBe(true);
    expect(byName.get('useResources')?.observed).toBe(false);
    expect(byName.get('releaseResources')?.observed).toBe(true);
    expect(byName.get('cancellable')?.observed).toBe(true);
    expect(byName.get('nonCancellable')?.observed).toBe(true);
    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(0);

    const report = createOverlayReport(overlay);
    expect(report).toContain('releaseResources (observed)');
    expect(report).toContain('useResources (not observed)');
  });

  it('maps update and patch operations with name and patch-id evidence', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/update/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const trace = runtimeTraceDocumentSchema.parse(
      await Bun.file(
        new URL(
          '../../../fixtures/update/.temporal-explorer/histories/updates.trace.json',
          import.meta.url,
        ),
      ).json(),
    );
    const overlay = createExecutionOverlay({
      analysis,
      trace,
      workflowName: 'updateWorkflow',
    });
    const updateMappings = overlay.mappings.filter((mapping) =>
      mapping.staticNodeId?.startsWith('update:'),
    );

    expect(updateMappings).toHaveLength(2);
    expect(
      updateMappings.every((mapping) =>
        mapping.evidence.some((evidence) => evidence.kind === 'update-name'),
      ),
    ).toBe(true);
    expect(updateMappings.every((mapping) => mapping.confidence === 'exact')).toBe(true);
  });

  it('marks unknown signals and surplus timers as unmapped', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/timer-race/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const trace = runtimeTraceDocumentSchema.parse(
      await Bun.file(
        new URL(
          '../../../fixtures/timer-race/.temporal-explorer/histories/timeout.trace.json',
          import.meta.url,
        ),
      ).json(),
    );
    const strangeOperations: RuntimeOperation[] = [
      {
        id: 'signal:mystery:90',
        kind: 'signal',
        signalName: 'mystery',
        receivedAt: '2026-01-01T00:00:00.090Z',
        eventReferences: [{ eventId: 90, eventType: 'WorkflowExecutionSignaled' }],
        payloadReferences: [],
      },
      {
        id: 'timer:9:91',
        kind: 'timer',
        timerId: '9',
        status: 'fired',
        startedAt: '2026-01-01T00:00:00.091Z',
        eventReferences: [{ eventId: 91, eventType: 'TimerStarted' }],
      },
    ];
    const overlay = createExecutionOverlay({
      analysis,
      trace: { ...trace, operations: [...trace.operations, ...strangeOperations] },
      workflowName: 'timerRaceWorkflow',
    });
    const unmappedReasons = overlay.mappings
      .filter((mapping) => !mapping.staticNodeId)
      .map((mapping) => mapping.reason);

    expect(unmappedReasons).toEqual([
      'No static Signal definition matched mystery.',
      'No static timer command matched runtime timer occurrence 2.',
    ]);
    expect(
      overlay.mappings
        .filter((mapping) => mapping.staticNodeId?.startsWith('timer:'))
        .every((mapping) => mapping.confidence === 'inferred'),
    ).toBe(true);
  });
});
