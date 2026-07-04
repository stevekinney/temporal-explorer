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

    expect(commandShape(projection)).toEqual([
      { kind: 'workflow', label: 'childWorkflowParent', state: 'completed' },
      { kind: 'child-workflow', label: 'reserveInventoryChild', state: 'completed' },
      { kind: 'child-workflow', label: 'releaseNotificationChild', state: 'completed' },
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

    expect(commandShape(projection)).toEqual([
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

    expect(commandShape(projection)).toEqual([
      { kind: 'workflow', label: 'continueAsNewWorkflow', state: 'observed' },
      { kind: 'activity', label: 'recordIteration', state: 'completed' },
      { kind: 'continue-as-new', label: 'continueAsNewWorkflow', state: 'observed' },
    ]);

    // continue-as-new keeps its command id and loops back to the workflow entry.
    const continueAsNewNode = projection.nodes.find((node) => node.kind === 'continue-as-new');
    expect(
      projection.edges.some(
        (edge) =>
          edge.source === continueAsNewNode?.id &&
          edge.target === 'workflow:continueAsNewWorkflow' &&
          edge.label === 'loop',
      ),
    ).toBe(true);
    expect(
      projection.timelineRows.find((row) => row.entry.label === 'Continued as new')?.state,
    ).toBe('observed');
  });
});
