import { describe, expect, it } from 'bun:test';

import type {
  ExecutionOverlayDocument,
  RuntimeNodeMapping,
  RuntimeOperation,
  RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

import { loadExplorerArtifacts } from '../server/artifacts';
import {
  buildGraphProjection,
  formatEventReferences,
  runtimeStateToken,
  sourceText,
} from './projection';
import { operationLabel } from './projection-helpers';
import {
  commandState,
  operationState,
  runtimeOperationRowState,
  workflowState,
} from './runtime-state';

const fixtureRoot = new URL('../../../../../fixtures/basic-order/', import.meta.url).pathname;
const retryFixtureRoot = new URL('../../../../../fixtures/retry/', import.meta.url).pathname;

function isActivityOperation(
  operation: RuntimeOperation,
): operation is Extract<RuntimeOperation, { kind: 'activity' }> {
  return operation.kind === 'activity';
}

describe('explorer graph projection', () => {
  it('projects graph nodes and timeline rows from validated artifacts', async () => {
    const artifacts = await loadExplorerArtifacts(fixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow) throw new Error('Expected a Workflow fixture.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    // The trailing structural `complete` terminal is excluded from the command leaves.
    expect(
      projection.nodes.filter((node) => node.kind !== 'terminal').map((node) => node.label),
    ).toEqual(['basicOrderWorkflow', 'validateOrder', 'chargeCard', 'shipOrder']);
    const activityIds = [
      'activity-call:basicOrderWorkflow:validateOrder:0',
      'activity-call:basicOrderWorkflow:chargeCard:1',
      'activity-call:basicOrderWorkflow:shipOrder:2',
    ];
    // The activities form a sequential chain rooted at the workflow node.
    expect(
      projection.edges
        .filter((edge) => activityIds.includes(edge.target))
        .map((edge) => ({ source: edge.source, target: edge.target })),
    ).toEqual([
      { source: 'workflow:basicOrderWorkflow', target: activityIds[0] },
      { source: activityIds[0], target: activityIds[1] },
      { source: activityIds[1], target: activityIds[2] },
    ]);
    expect(projection.timelineRows.map((row) => row.entry.label)).toContain(
      'validateOrder scheduled',
    );
    expect(
      projection.timelineRows.find((row) => row.entry.label === 'chargeCard scheduled')
        ?.graphNodeId,
    ).toBe('activity-call:basicOrderWorkflow:chargeCard:1');
    expect(
      projection.nodesById.get('activity-call:basicOrderWorkflow:validateOrder:0')?.sourceText,
    ).toBe('src/workflows/basic-order-workflow.ts:17');
  });

  it('projects runtime-only nodes for unmapped operations', async () => {
    const artifacts = await loadExplorerArtifacts(fixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = structuredClone(artifacts.traces[0]) as RuntimeTraceDocument | undefined;
    const overlay = artifacts.overlays[0];
    const firstActivity = trace?.operations.find(isActivityOperation);

    if (!workflow || !trace || !firstActivity) {
      throw new Error('Expected graph projection fixtures.');
    }

    const extraActivity: RuntimeOperation = {
      ...firstActivity,
      id: 'activity:unmappedActivity:99',
      activityType: 'unmappedActivity',
      activityId: 'unmapped-activity',
      eventReferences: [{ eventId: 99, eventType: 'ActivityTaskScheduled' }],
    };
    const unmappedOperation: RuntimeOperation = {
      id: 'unmapped:timer:100',
      kind: 'unmapped',
      eventReferences: [{ eventId: 100, eventType: 'TimerFired' }],
      reason: 'Timer mapping is outside the MVP slice.',
    };
    trace.operations.push(extraActivity, unmappedOperation);

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(
      projection.nodes.filter((node) => node.kind === 'runtime').map((node) => node.label),
    ).toEqual(['unmappedActivity', 'Unmapped history operation']);
    expect(
      projection.runtimeOperationRows.find((row) => row.operation.id === extraActivity.id)
        ?.sourceText,
    ).toBe('not resolved');
    expect(operationLabel({ ...firstActivity, activityType: 'displayActivity' })).toBe(
      'displayActivity',
    );
    expect(
      operationLabel({
        id: 'workflow:failed',
        kind: 'workflow-lifecycle',
        status: 'failed',
        eventReferences: [{ eventId: 7, eventType: 'WorkflowExecutionFailed' }],
        payloadReferences: [],
      }),
    ).toBe('Workflow failed');
  });

  it('formats graph runtime state helpers', async () => {
    const artifacts = await loadExplorerArtifacts(fixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = structuredClone(artifacts.overlays[0]) as ExecutionOverlayDocument | undefined;
    const command = workflow?.temporalCommands[0];
    const activity = trace?.operations.find(isActivityOperation);

    if (!workflow || !trace || !overlay || !command || !activity) {
      throw new Error('Expected graph state fixtures.');
    }

    const unmappedOperation: RuntimeOperation = {
      id: 'unmapped:history:1',
      kind: 'unmapped',
      eventReferences: [{ eventId: 1, eventType: 'UnknownEventType999' }],
      reason: 'Unknown history event.',
    };
    const mappingWithoutStaticNode: RuntimeNodeMapping = {
      runtimeOperationId: unmappedOperation.id,
      confidence: 'unknown',
      reason: 'No static node was available.',
      evidence: [],
    };
    const ambiguousMapping: RuntimeNodeMapping = {
      runtimeOperationId: activity.id,
      staticNodeId: command.id,
      confidence: 'ambiguous',
      reason: 'Multiple candidates were available.',
      evidence: [],
    };

    overlay.staticNodes = overlay.staticNodes.map((node) =>
      node.id === command.id ? { ...node, observed: false } : node,
    );

    const firstAttempt = activity.attempts[0];

    if (!firstAttempt) {
      throw new Error('Expected an Activity attempt fixture.');
    }

    expect(sourceText(undefined)).toBe('not resolved');
    expect(formatEventReferences([{ eventId: 3, eventType: 'ActivityTaskStarted' }])).toBe(
      'Event 3 ActivityTaskStarted',
    );
    expect(runtimeStateToken('not taken')).toBe('not-taken');
    expect(operationState(undefined)).toBe('not taken');
    expect(operationState(unmappedOperation)).toBe('unmapped');
    expect(operationState({ ...activity, attempts: [...activity.attempts, firstAttempt] })).toBe(
      'retried',
    );
    expect(
      operationState({
        id: 'workflow:canceled',
        kind: 'workflow-lifecycle',
        status: 'canceled',
        eventReferences: [{ eventId: 8, eventType: 'WorkflowExecutionCanceled' }],
        payloadReferences: [],
      }),
    ).toBe('canceled');
    expect(workflowState(undefined)).toBe('not taken');
    expect(workflowState({ ...trace, execution: { ...trace.execution, status: 'running' } })).toBe(
      'pending',
    );
    expect(
      workflowState({ ...trace, execution: { ...trace.execution, status: 'terminated' } }),
    ).toBe('canceled');
    expect(runtimeOperationRowState(mappingWithoutStaticNode, unmappedOperation)).toBe('unmapped');
    expect(runtimeOperationRowState(ambiguousMapping, activity)).toBe('ambiguous');
    expect(commandState(command, overlay, trace.operations, new Map())).toBe('not taken');
  });

  it('treats a compacted single attempt record with attempt > 1 as retried', async () => {
    const success = await loadExplorerArtifacts(retryFixtureRoot);
    const successTrace = success.traces.find((candidate) =>
      candidate.artifactId.includes(':retry-success:'),
    );
    const successActivity = successTrace?.operations.find(isActivityOperation);

    if (!successActivity) throw new Error('Expected the retry-success activity fixture.');

    expect(successActivity.attempts).toHaveLength(1);
    expect(successActivity.attempts[0]?.attempt).toBe(3);
    expect(operationState(successActivity)).toBe('retried');

    const failure = await loadExplorerArtifacts(retryFixtureRoot);
    const failureTrace = failure.traces.find((candidate) =>
      candidate.artifactId.includes(':failure:'),
    );
    const failureActivity = failureTrace?.operations.find(isActivityOperation);

    if (!failureActivity) throw new Error('Expected the retry failure activity fixture.');

    expect(operationState(failureActivity)).toBe('failed');
  });

  it('assigns unique node and edge ids for every fixture projection', async () => {
    // Regression: Svelte keyed `{#each}` renders throw on duplicate keys (this is
    // what crashed continue-as-new via the timeline). The control-flow graph adds
    // many structural nodes/edges, so every fixture projection must keep node and
    // edge ids unique — a collision would crash the whole flow panel.
    const fixturesRoot = new URL('../../../../../fixtures/', import.meta.url).pathname;
    const glob = new Bun.Glob('*/');
    const scanned = await Array.fromAsync(glob.scan({ cwd: fixturesRoot, onlyFiles: false }));
    const fixtureDirs = scanned.map((dir) => dir.replace(/\/$/, '')).toSorted();

    const offenders: string[] = [];
    for (const dir of fixtureDirs) {
      let artifacts;
      try {
        artifacts = await loadExplorerArtifacts(`${fixturesRoot}${dir}`);
      } catch {
        continue; // Not every top-level fixtures/ entry is an artifact project.
      }
      for (const workflow of artifacts.analysis.workflows) {
        const projection = buildGraphProjection({
          workflow,
          trace: artifacts.traces[0],
          overlay: artifacts.overlays[0],
        });
        const nodeIds = projection.nodes.map((node) => node.id);
        const edgeIds = projection.edges.map((edge) => edge.id);
        if (new Set(nodeIds).size !== nodeIds.length)
          offenders.push(`${dir}/${workflow.name} nodes`);
        if (new Set(edgeIds).size !== edgeIds.length)
          offenders.push(`${dir}/${workflow.name} edges`);
      }
    }

    expect(fixtureDirs.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
