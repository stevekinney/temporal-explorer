import { describe, expect, it } from 'bun:test';

import type { SourceLocation, WorkflowDefinition } from '@temporal-explorer/schemas';

import { loadExplorerArtifacts } from '../server/artifacts';
import { buildGraphProjection, type GraphProjection } from './projection';

const cancellationFixtureRoot = new URL('../../../../../fixtures/cancellation/', import.meta.url)
  .pathname;
const patchedFixtureRoot = new URL('../../../../../fixtures/patched/', import.meta.url).pathname;
const dynamicFixtureRoot = new URL('../../../../../fixtures/dynamic/', import.meta.url).pathname;

const source: SourceLocation = {
  path: 'src/workflows.ts',
  pathKind: 'project-relative',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

/** Maps a projection to its ordered node skeleton for structural assertions. */
function shape(projection: GraphProjection): Array<{ kind: string; label: string; state: string }> {
  return projection.nodes.map((node) => ({
    kind: node.kind,
    label: node.label,
    state: node.state,
  }));
}

describe('cancellation scope, patch, and dynamic dispatch projection', () => {
  it('renders the try/catch region and top-level activities matching the Mermaid flow', async () => {
    const artifacts = await loadExplorerArtifacts(cancellationFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected cancellation fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(shape(projection)).toEqual([
      { kind: 'workflow', label: 'cancellationWorkflow', state: 'canceled' },
      { kind: 'try-region', label: 'try', state: 'observed' },
      { kind: 'join', label: '', state: 'observed' },
      { kind: 'terminal', label: 'return', state: 'observed' },
      { kind: 'branch-region', label: 'if', state: 'observed' },
      { kind: 'decision', label: 'if', state: 'observed' },
      { kind: 'join', label: '', state: 'observed' },
      { kind: 'terminal', label: 'throw', state: 'observed' },
      { kind: 'terminal', label: 'throw', state: 'observed' },
      { kind: 'cancellation-scope', label: 'cancellable', state: 'observed' },
      { kind: 'cancellation-scope', label: 'nonCancellable', state: 'observed' },
    ]);

    // The try body/handler markers nest under the try region; cancellation scopes stay satellites.
    const tryRegion = projection.nodes.find((node) => node.kind === 'try-region');
    expect(
      projection.nodes.filter((node) => node.parentId === tryRegion?.id).map((node) => node.kind),
    ).toEqual(['join', 'terminal', 'branch-region', 'terminal']);
    expect(
      projection.edges
        .filter((edge) => edge.target === 'workflow:cancellationWorkflow')
        .map((edge) => edge.label),
    ).toEqual(['scope', 'scope']);

    expect(
      projection.runtimeOperationRows.find((row) => row.operation.id === 'cancel-request:12'),
    ).toMatchObject({ state: 'observed', graphNodeId: 'workflow:cancellationWorkflow' });
    expect(
      projection.timelineRows.find((row) => row.entry.label === 'Cancellation requested')?.state,
    ).toBe('observed');
  });

  it('projects the patched ternary as a branch region with observed patch decision', async () => {
    const artifacts = await loadExplorerArtifacts(patchedFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected patched fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(shape(projection)).toEqual([
      { kind: 'workflow', label: 'patchedWorkflow', state: 'completed' },
      { kind: 'patch', label: 'legacy-tax-rounding (deprecated)', state: 'observed' },
      { kind: 'branch-region', label: 'ternary', state: 'observed' },
      { kind: 'decision', label: 'use-modern-charge', state: 'observed' },
      { kind: 'join', label: '', state: 'observed' },
      { kind: 'activity', label: 'newCharge', state: 'completed' },
      { kind: 'activity', label: 'oldCharge', state: 'not taken' },
      { kind: 'terminal', label: 'complete', state: 'observed' },
    ]);

    const region = projection.nodes.find((node) => node.kind === 'branch-region');
    const decision = projection.nodes.find((node) => node.kind === 'decision');
    expect(projection.nodesById.get('activity-call:patchedWorkflow:newCharge:2')?.parentId).toBe(
      region?.id,
    );
    expect(
      projection.edges.filter((edge) => edge.source === decision?.id).map((edge) => edge.label),
    ).toEqual(["patched('use-modern-charge')", 'else']);
    expect(
      projection.runtimeOperationRows.find((row) => row.operation.id === 'marker:core_patch:5')
        ?.state,
    ).toBe('observed');
  });

  it('projects the dynamic dispatch loop as a region covering two runtime activities', async () => {
    const artifacts = await loadExplorerArtifacts(dynamicFixtureRoot);
    const workflow = artifacts.analysis.workflows[0];
    const trace = artifacts.traces[0];
    const overlay = artifacts.overlays[0];

    if (!workflow || !trace || !overlay) throw new Error('Expected dynamic fixtures.');

    const projection = buildGraphProjection({ workflow, trace, overlay });

    expect(shape(projection)).toEqual([
      { kind: 'workflow', label: 'dynamicWorkflow', state: 'completed' },
      { kind: 'activity', label: 'archiveRequest', state: 'completed' },
      { kind: 'loop-region', label: 'loop (for-of)', state: 'observed' },
      { kind: 'decision', label: 'loop (for-of)', state: 'observed' },
      { kind: 'join', label: '', state: 'observed' },
      { kind: 'dynamic', label: 'dynamicActivities[step]', state: 'completed' },
      { kind: 'terminal', label: 'complete', state: 'observed' },
    ]);

    const region = projection.nodes.find((node) => node.kind === 'loop-region');
    expect(projection.nodesById.get('dynamic:dynamicWorkflow:1')?.parentId).toBe(region?.id);
    expect(projection.nodesById.get('dynamic:dynamicWorkflow:1')?.confidence).toBe('dynamic');
    expect(
      projection.runtimeOperationRows
        .filter((row) => row.graphNodeId === 'dynamic:dynamicWorkflow:1')
        .map((row) => row.operation.id),
    ).toEqual(['activity:prepareShipment:11', 'activity:notifyWarehouse:17']);
  });

  it('projects nexus-operation and search-attribute commands from a flat command list', () => {
    const workflow: WorkflowDefinition = {
      id: 'workflow:caller',
      name: 'caller',
      source,
      exported: true,
      signature: {
        args: [],
        result: { id: 'void', display: 'void', kind: 'primitive', confidence: 'exact' },
      },
      messageSurface: { signals: [], queries: [], updates: [] },
      state: { variables: [] },
      body: { nodes: [] },
      temporalCommands: [
        {
          id: 'nexus-operation:caller:echo:0',
          kind: 'nexus-operation',
          name: 'echo',
          source,
          confidence: 'exact',
          staticOrder: 0,
        },
        {
          id: 'search-attribute:caller:1',
          kind: 'search-attribute',
          name: 'upsertSearchAttributes',
          source,
          confidence: 'exact',
          staticOrder: 1,
        },
      ],
      dependencies: [],
      diagnostics: [],
    };

    const projection = buildGraphProjection({ workflow, trace: undefined, overlay: undefined });

    expect(projection.nodes.map((node) => ({ kind: node.kind, label: node.label }))).toEqual([
      { kind: 'workflow', label: 'caller' },
      { kind: 'nexus-operation', label: 'echo' },
      { kind: 'search-attribute', label: 'upsertSearchAttributes' },
    ]);
    expect(projection.edges.map((edge) => edge.label)).toEqual([
      'Nexus operation 1',
      'Search attribute 1',
    ]);
  });
});
