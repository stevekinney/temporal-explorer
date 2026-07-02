import { describe, expect, it } from 'bun:test';

import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
} from '@temporal-explorer/schemas';

import { createAggregateReport, formatAggregateReport } from './index';

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
});
