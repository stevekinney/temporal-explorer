import { describe, expect, it } from 'bun:test';

import { loadExplorerArtifacts } from '../server/artifacts';
import { buildGraphProjection, type GraphProjection } from './projection';

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

const queryFixtureRoot = new URL('../../../../../fixtures/query/', import.meta.url).pathname;
const updateFixtureRoot = new URL('../../../../../fixtures/update/', import.meta.url).pathname;

describe('query and update message-surface projection', () => {
  it('projects query nodes as not taken since queries never appear in Event History', async () => {
    const artifacts = await loadExplorerArtifacts(queryFixtureRoot);
    const workflow = artifacts.analysis.workflows.find(
      (candidate) => candidate.name === 'queryWorkflow',
    );
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected query fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(commandShape(projection)).toEqual([
      { kind: 'workflow', label: 'queryWorkflow', state: 'completed' },
      { kind: 'activity', label: 'recordAudit', state: 'completed' },
      { kind: 'condition', label: '() => done', state: 'not taken' },
      { kind: 'signal', label: 'complete', state: 'observed' },
      { kind: 'query', label: 'auditCount', state: 'not taken' },
      { kind: 'query', label: 'bump', state: 'not taken' },
      { kind: 'query', label: 'status', state: 'not taken' },
    ]);

    expect(
      projection.edges.filter((edge) => edge.label === 'query').map((edge) => edge.source),
    ).toEqual([
      'query:queryWorkflow:auditCount',
      'query:queryWorkflow:bump',
      'query:queryWorkflow:status',
    ]);

    expect(workflow.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'TEA_QUERY_STATE_MUTATION',
    );
  });

  it('projects update nodes with completed and failed states for the update fixture', async () => {
    const artifacts = await loadExplorerArtifacts(updateFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected update fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(commandShape(projection)).toEqual([
      { kind: 'workflow', label: 'updateWorkflow', state: 'completed' },
      {
        kind: 'condition',
        label: '() => updatesApplied >= 1 && failedUpdates >= 1',
        state: 'not taken',
      },
      { kind: 'activity', label: 'recordAddress', state: 'completed' },
      { kind: 'update', label: 'explode', state: 'failed' },
      { kind: 'update', label: 'setAddress', state: 'completed' },
    ]);

    expect(
      projection.edges.filter((edge) => edge.label === 'update').map((edge) => edge.source),
    ).toEqual(['update:updateWorkflow:explode', 'update:updateWorkflow:setAddress']);

    expect(
      projection.runtimeOperationRows.find((row) => row.operation.id === 'update:explode:16')
        ?.state,
    ).toBe('failed');
    expect(
      projection.timelineRows.find((row) => row.entry.label === 'Update explode failed')
        ?.graphNodeId,
    ).toBe('update:updateWorkflow:explode');
  });
});
