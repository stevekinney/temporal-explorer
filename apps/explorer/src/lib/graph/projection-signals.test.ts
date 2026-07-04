import { describe, expect, it } from 'bun:test';

import type { ExecutionOverlayDocument, RuntimeOperation } from '@temporal-explorer/schemas';

import { loadExplorerArtifacts } from '../server/artifacts';
import { buildGraphProjection, type GraphProjection } from './projection';
import { commandState, operationState } from './runtime-state';

/** Structural control-flow nodes carry no runtime state; drop them to assert the command/message leaves. */
const STRUCTURAL_KINDS = new Set([
  'branch-region',
  'loop-region',
  'parallel-region',
  'try-region',
  'decision',
  'join',
  'terminal',
]);

function commandShape(
  projection: GraphProjection,
): Array<{ kind: string; label: string; state: string }> {
  return projection.nodes
    .filter((node) => !STRUCTURAL_KINDS.has(node.kind))
    .map((node) => ({ kind: node.kind, label: node.label, state: node.state }));
}

const approvalFixtureRoot = new URL('../../../../../fixtures/approval/', import.meta.url).pathname;
const timerRaceFixtureRoot = new URL('../../../../../fixtures/timer-race/', import.meta.url)
  .pathname;

describe('signal, timer, and condition projection', () => {
  it('projects a signal node and a not-taken condition for the approval fixture', async () => {
    const artifacts = await loadExplorerArtifacts(approvalFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected approval fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(commandShape(projection)).toEqual([
      { kind: 'workflow', label: 'approvalWorkflow', state: 'completed' },
      { kind: 'condition', label: '() => approval !== undefined', state: 'not taken' },
      { kind: 'activity', label: 'recordApproval', state: 'completed' },
      { kind: 'signal', label: 'approve', state: 'observed' },
    ]);

    // The signal remains a satellite edged into the workflow node.
    expect(
      projection.edges
        .filter((edge) => edge.target === 'workflow:approvalWorkflow')
        .map((edge) => ({ label: edge.label, source: edge.source })),
    ).toEqual([{ label: 'signal', source: 'signal:approvalWorkflow:approve' }]);

    const signalTimelineRow = projection.timelineRows.find(
      (row) => row.entry.label === 'Signal approve received',
    );

    expect(signalTimelineRow?.graphNodeId).toBe('signal:approvalWorkflow:approve');
    expect(signalTimelineRow?.state).toBe('observed');
  });

  it('projects a fired timer for the timer-race timeout trace', async () => {
    const artifacts = await loadExplorerArtifacts(timerRaceFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces.find((candidate) => candidate.artifactId.includes(':timeout:'));
    const overlay = artifacts.overlays.find(
      (candidate) => candidate.runtimeTraceId === trace?.artifactId,
    );

    if (!workflow || !trace || !overlay) throw new Error('Expected timer-race timeout fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(commandShape(projection)).toEqual([
      { kind: 'workflow', label: 'timerRaceWorkflow', state: 'completed' },
      { kind: 'condition', label: '() => approvedBy !== undefined', state: 'not taken' },
      { kind: 'timer', label: "'30 days'", state: 'fired' },
      { kind: 'activity', label: 'notifyApproved', state: 'not taken' },
      { kind: 'activity', label: 'notifyExpired', state: 'completed' },
      { kind: 'signal', label: 'approve', state: 'not taken' },
    ]);

    const timerStartedRow = projection.timelineRows.find(
      (row) => row.entry.label === 'Timer 1 started',
    );
    const timerFiredRow = projection.timelineRows.find(
      (row) => row.entry.label === 'Timer 1 fired',
    );

    expect(timerStartedRow?.graphNodeId).toBe('timer:timerRaceWorkflow:1');
    expect(timerFiredRow?.graphNodeId).toBe('timer:timerRaceWorkflow:1');
    expect(timerFiredRow?.state).toBe('fired');
  });

  it('projects a canceled timer and observed signal for the timer-race signal-wins trace', async () => {
    const artifacts = await loadExplorerArtifacts(timerRaceFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces.find((candidate) =>
      candidate.artifactId.includes(':signal-wins:'),
    );
    const overlay = artifacts.overlays.find(
      (candidate) => candidate.runtimeTraceId === trace?.artifactId,
    );

    if (!workflow || !trace || !overlay) {
      throw new Error('Expected timer-race signal-wins fixtures.');
    }

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(projection.nodesById.get('timer:timerRaceWorkflow:1')?.state).toBe('canceled');
    expect(projection.nodesById.get('signal:timerRaceWorkflow:approve')?.state).toBe('observed');
    expect(projection.nodesById.get('activity-call:timerRaceWorkflow:notifyExpired:3')?.state).toBe(
      'not taken',
    );
  });

  it('resolves runtime states for signal and timer operations directly', () => {
    const pendingTimer: RuntimeOperation = {
      id: 'timer:1:5',
      kind: 'timer',
      timerId: '1',
      status: 'pending',
      startedAt: '2026-01-01T00:00:00.005Z',
      eventReferences: [{ eventId: 5, eventType: 'TimerStarted' }],
    };
    const signalOperation: RuntimeOperation = {
      id: 'signal:approve:5',
      kind: 'signal',
      signalName: 'approve',
      receivedAt: '2026-01-01T00:00:00.005Z',
      eventReferences: [{ eventId: 5, eventType: 'WorkflowExecutionSignaled' }],
      payloadReferences: [],
    };
    const observedSignalOverlay: ExecutionOverlayDocument = {
      schemaVersion: 'temporal-overlay/v1',
      artifactId: 'overlay:test',
      staticAnalysisId: 'analysis:test',
      runtimeTraceId: 'trace:test',
      workflow: 'testWorkflow',
      staticNodes: [{ id: 'signal:test', kind: 'signal', name: 'test', observed: true }],
      mappings: [],
      branchOutcomes: [],
      coverage: {
        nodes: { total: 0, observed: 0, skipped: 0, unmappedRuntimeOperations: 0 },
        activities: { staticTotal: 0, observed: 0, retried: 0, failed: 0 },
        messages: {
          staticSignals: 0,
          receivedSignals: [],
          staticUpdates: 0,
          receivedUpdates: [],
          staticQueries: 0,
        },
        timers: { staticTotal: 0, fired: 0, canceled: 0, pending: 0 },
      },
      diagnostics: [],
    };

    expect(operationState(pendingTimer)).toBe('pending');
    expect(operationState(signalOperation)).toBe('observed');
    expect(
      commandState({ id: 'signal:test' }, observedSignalOverlay, [], new Map(), 'observed'),
    ).toBe('observed');
  });
});
