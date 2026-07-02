import { describe, expect, it } from 'bun:test';

import { loadExplorerArtifacts } from '../server/artifacts';
import { buildGraphProjection } from './projection';

const cancellationFixtureRoot = new URL('../../../../../fixtures/cancellation/', import.meta.url)
  .pathname;
const patchedFixtureRoot = new URL('../../../../../fixtures/patched/', import.meta.url).pathname;
const dynamicFixtureRoot = new URL('../../../../../fixtures/dynamic/', import.meta.url).pathname;

describe('cancellation scope, patch, and dynamic dispatch projection', () => {
  it('excludes cancellation scopes from the sequential chain but renders them as scope-edged nodes', async () => {
    const artifacts = await loadExplorerArtifacts(cancellationFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected cancellation fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(
      projection.nodes.map((node) => ({ kind: node.kind, label: node.label, state: node.state })),
    ).toEqual([
      { kind: 'workflow', label: 'cancellationWorkflow', state: 'canceled' },
      { kind: 'activity', label: 'reserveResources', state: 'completed' },
      { kind: 'timer', label: "'30 days'", state: 'canceled' },
      { kind: 'activity', label: 'useResources', state: 'not taken' },
      { kind: 'activity', label: 'releaseResources', state: 'completed' },
      { kind: 'cancellation-scope', label: 'cancellable', state: 'observed' },
      { kind: 'cancellation-scope', label: 'nonCancellable', state: 'observed' },
    ]);

    expect(projection.edges.map((edge) => ({ label: edge.label, target: edge.target }))).toEqual([
      { label: 'Activity 1', target: 'activity-call:cancellationWorkflow:reserveResources:1' },
      { label: 'Timer 1', target: 'timer:cancellationWorkflow:2' },
      { label: 'Activity 2', target: 'activity-call:cancellationWorkflow:useResources:3' },
      { label: 'Activity 3', target: 'activity-call:cancellationWorkflow:releaseResources:5' },
      { label: 'scope', target: 'workflow:cancellationWorkflow' },
      { label: 'scope', target: 'workflow:cancellationWorkflow' },
    ]);

    expect(
      projection.runtimeOperationRows.find((row) => row.operation.id === 'cancel-request:12'),
    ).toMatchObject({ state: 'observed', graphNodeId: 'workflow:cancellationWorkflow' });
    expect(
      projection.timelineRows.find((row) => row.entry.label === 'Cancellation requested')?.state,
    ).toBe('observed');
  });

  it('projects observed patch nodes and a not-taken legacy activity for the patched-run trace', async () => {
    const artifacts = await loadExplorerArtifacts(patchedFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected patched fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(
      projection.nodes.map((node) => ({ kind: node.kind, label: node.label, state: node.state })),
    ).toEqual([
      { kind: 'workflow', label: 'patchedWorkflow', state: 'completed' },
      { kind: 'patch', label: 'legacy-tax-rounding', state: 'observed' },
      { kind: 'patch', label: 'use-modern-charge', state: 'observed' },
      { kind: 'activity', label: 'newCharge', state: 'completed' },
      { kind: 'activity', label: 'oldCharge', state: 'not taken' },
    ]);

    expect(projection.edges.map((edge) => edge.label)).toEqual([
      'Patch 1',
      'Patch 2',
      'Activity 1',
      'Activity 2',
    ]);
    expect(
      projection.runtimeOperationRows.find((row) => row.operation.id === 'marker:core_patch:5')
        ?.state,
    ).toBe('observed');
  });

  it('projects a dynamic node with dynamic confidence covering two runtime activities', async () => {
    const artifacts = await loadExplorerArtifacts(dynamicFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected dynamic fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(
      projection.nodes.map((node) => ({ kind: node.kind, label: node.label, state: node.state })),
    ).toEqual([
      { kind: 'workflow', label: 'dynamicWorkflow', state: 'completed' },
      { kind: 'activity', label: 'archiveRequest', state: 'completed' },
      { kind: 'dynamic', label: 'dynamicActivities[step]', state: 'completed' },
    ]);

    expect(projection.nodesById.get('dynamic:dynamicWorkflow:1')?.confidence).toBe('dynamic');
    expect(
      projection.runtimeOperationRows
        .filter((row) => row.graphNodeId === 'dynamic:dynamicWorkflow:1')
        .map((row) => row.operation.id),
    ).toEqual(['activity:prepareShipment:11', 'activity:notifyWarehouse:17']);
  });
});
