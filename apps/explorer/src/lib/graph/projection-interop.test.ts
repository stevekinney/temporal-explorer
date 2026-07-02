import { describe, expect, it } from 'bun:test';

import { loadExplorerArtifacts } from '../server/artifacts';
import { buildGraphProjection } from './projection';

const childWorkflowFixtureRoot = new URL('../../../../../fixtures/child-workflow/', import.meta.url)
  .pathname;
const externalFixtureRoot = new URL('../../../../../fixtures/external/', import.meta.url).pathname;
const continueAsNewFixtureRoot = new URL(
  '../../../../../fixtures/continue-as-new/',
  import.meta.url,
).pathname;

describe('child workflow, external workflow, and continue-as-new projection', () => {
  it('projects two completed child-workflow nodes for the child-workflow success trace', async () => {
    const artifacts = await loadExplorerArtifacts(childWorkflowFixtureRoot);
    const workflow = artifacts.analysis.workflows.find(
      (candidate) => candidate.name === 'childWorkflowParent',
    );
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected child-workflow fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(
      projection.nodes.map((node) => ({ kind: node.kind, label: node.label, state: node.state })),
    ).toEqual([
      { kind: 'workflow', label: 'childWorkflowParent', state: 'completed' },
      { kind: 'child-workflow', label: 'reserveInventoryChild', state: 'completed' },
      { kind: 'child-workflow', label: 'releaseNotificationChild', state: 'completed' },
    ]);

    expect(projection.edges.map((edge) => edge.label)).toEqual([
      'Child workflow 1',
      'Child workflow 2',
    ]);
  });

  it('projects an external-workflow node and a completed external signal for the external signaled trace', async () => {
    const artifacts = await loadExplorerArtifacts(externalFixtureRoot);
    const workflow = artifacts.analysis.workflows.find(
      (candidate) => candidate.name === 'externalWorkflowInteraction',
    );
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected external fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(
      projection.nodes.map((node) => ({ kind: node.kind, label: node.label, state: node.state })),
    ).toEqual([
      { kind: 'workflow', label: 'externalWorkflowInteraction', state: 'completed' },
      { kind: 'condition', label: '() => targetWorkflowId !== undefined', state: 'not taken' },
      { kind: 'external-workflow', label: 'release', state: 'completed' },
      { kind: 'signal', label: 'targetReady', state: 'observed' },
    ]);

    expect(
      projection.runtimeOperationRows.find(
        (row) => row.operation.id === 'external-signal:release:9',
      )?.state,
    ).toBe('completed');
  });

  it('projects a continue-as-new node and an observed workflow status for the rollover trace', async () => {
    const artifacts = await loadExplorerArtifacts(continueAsNewFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected continue-as-new fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(
      projection.nodes.map((node) => ({ kind: node.kind, label: node.label, state: node.state })),
    ).toEqual([
      { kind: 'workflow', label: 'continueAsNewWorkflow', state: 'observed' },
      { kind: 'activity', label: 'recordIteration', state: 'completed' },
      { kind: 'continue-as-new', label: 'continueAsNewWorkflow', state: 'observed' },
    ]);

    expect(projection.edges.map((edge) => edge.label)).toEqual(['Activity 1', 'Continue as new']);
    expect(
      projection.timelineRows.find((row) => row.entry.label === 'Continued as new')?.state,
    ).toBe('observed');
  });
});
