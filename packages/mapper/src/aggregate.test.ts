import { describe, expect, it } from 'bun:test';

import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
} from '@temporal-explorer/schemas';

import { createAggregateReport, createExecutionOverlay, formatAggregateReport } from './index';

describe('aggregate analysis', () => {
  it('aggregates retries, rare branches, and timer outcomes across runs', async () => {
    const loadJson = async (path: string) => await Bun.file(new URL(path, import.meta.url)).json();
    const traces = [
      runtimeTraceDocumentSchema.parse(
        await loadJson(
          '../../../fixtures/timer-race/.temporal-explorer/histories/signal-wins.trace.json',
        ),
      ),
      runtimeTraceDocumentSchema.parse(
        await loadJson(
          '../../../fixtures/timer-race/.temporal-explorer/histories/timeout.trace.json',
        ),
      ),
    ];
    const overlays = [
      executionOverlayDocumentSchema.parse(
        await loadJson(
          '../../../fixtures/timer-race/.temporal-explorer/overlays/signal-wins.overlay.json',
        ),
      ),
      executionOverlayDocumentSchema.parse(
        await loadJson(
          '../../../fixtures/timer-race/.temporal-explorer/overlays/timeout.overlay.json',
        ),
      ),
    ];
    const report = createAggregateReport({
      workflowType: 'timerRaceWorkflow',
      traces,
      overlays,
    });

    expect(report.runs).toBe(2);
    expect(report.statuses).toEqual({ completed: 2 });
    expect(report.timers).toEqual({ fired: 1, canceled: 1, pending: 0 });
    expect(report.signals).toEqual({ approve: 1 });
    expect(
      report.rareBranchNodes.map((node) => [node.name, node.observedRuns, node.totalRuns]),
    ).toEqual([
      ['notifyApproved', 1, 2],
      ['notifyExpired', 1, 2],
      ['approve', 1, 2],
    ]);
    expect(report.hotPathNodes.map((node) => node.name)).toContain('timerRaceWorkflow');
    expect(() => createAggregateReport({ workflowType: 'missing', traces, overlays })).toThrow(
      'No trace artifacts matched Workflow type "missing".',
    );

    const formatted = formatAggregateReport(report);
    expect(formatted).toContain('Rare branches');
    expect(formatted).toContain('notifyExpired: 1/2');
  });

  it('upgrades dynamic mappings with replay-confirmed command sequences', async () => {
    const loadJson = async (path: string) => await Bun.file(new URL(path, import.meta.url)).json();
    const analysis = temporalAnalysisDocumentSchema.parse(
      await loadJson('../../../fixtures/dynamic/.temporal-explorer/analysis.json'),
    );
    const trace = runtimeTraceDocumentSchema.parse(
      await loadJson('../../../fixtures/dynamic/.temporal-explorer/histories/planned.trace.json'),
    );
    const overlay = createExecutionOverlay({
      analysis,
      trace,
      workflowName: 'dynamicWorkflow',
      replayCapture: [
        { kind: 'activity', name: 'archiveRequest', sequence: 1 },
        { kind: 'activity', name: 'prepareShipment', sequence: 2 },
        { kind: 'activity', name: 'notifyWarehouse', sequence: 3 },
      ],
    });
    const dynamicMappings = overlay.mappings.filter((mapping) =>
      mapping.staticNodeId?.startsWith('dynamic:'),
    );

    expect(dynamicMappings).toHaveLength(2);
    expect(dynamicMappings.every((mapping) => mapping.confidence === 'inferred')).toBe(true);
    expect(
      dynamicMappings.every((mapping) =>
        mapping.evidence.some((evidence) => evidence.kind === 'replay-command-sequence'),
      ),
    ).toBe(true);

    const mismatched = createExecutionOverlay({
      analysis,
      trace,
      workflowName: 'dynamicWorkflow',
      replayCapture: [{ kind: 'activity', name: 'wrongActivity', sequence: 1 }],
    });
    const untouched = mismatched.mappings.filter((mapping) =>
      mapping.staticNodeId?.startsWith('dynamic:'),
    );

    expect(untouched.every((mapping) => mapping.confidence === 'dynamic')).toBe(true);
  });
});
