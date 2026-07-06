import { describe, expect, it } from 'bun:test';

import type {
  FlowNode,
  SourceLocation,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { buildGraphProjection, type GraphProjection } from './projection';

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

function activityCommand(id: string, name: string, staticOrder: number): TemporalCommand {
  return { id, kind: 'activity', name, source, confidence: 'exact', staticOrder };
}

/** Builds a minimal Workflow with the given structured `body.nodes` and backing commands. */
function makeWorkflow(nodes: FlowNode[], commands: TemporalCommand[]): WorkflowDefinition {
  return {
    id: 'workflow:w',
    name: 'w',
    source,
    exported: true,
    signature: {
      args: [],
      result: { id: 'void', display: 'void', kind: 'primitive', confidence: 'exact' },
    },
    messageSurface: { signals: [], queries: [], updates: [] },
    state: { variables: [] },
    body: { nodes },
    temporalCommands: commands,
    dependencies: [],
    diagnostics: [],
  };
}

function project(nodes: FlowNode[], commands: TemporalCommand[]): GraphProjection {
  return buildGraphProjection({
    workflow: makeWorkflow(nodes, commands),
    trace: undefined,
    overlay: undefined,
  });
}

describe('nested control-flow projection per FlowNode type', () => {
  it('projects a command leaf as a sequential node between the workflow and complete', () => {
    const projection = project(
      [{ type: 'command', id: 'f1', commandId: 'a:1' }],
      [activityCommand('a:1', 'doThing', 0)],
    );

    // With no trace/overlay, command leaves resolve to `not taken`; structural nodes are neutral.
    expect(shape(projection)).toEqual([
      { kind: 'workflow', label: 'w', state: 'not taken' },
      { kind: 'activity', label: 'doThing', state: 'not taken' },
      { kind: 'terminal', label: 'complete', state: 'observed' },
    ]);
    expect(projection.nodesById.get('a:1')?.parentId).toBeUndefined();
  });

  it('projects a branch as a region container with labeled arms converging on a join', () => {
    const projection = project(
      [
        {
          type: 'branch',
          id: 'b',
          branchKind: 'if',
          clauses: [{ label: 'ok', body: [{ type: 'command', id: 'c1', commandId: 'a:1' }] }],
          otherwise: [{ type: 'command', id: 'c2', commandId: 'a:2' }],
        },
      ],
      [activityCommand('a:1', 'onOk', 0), activityCommand('a:2', 'onElse', 1)],
    );

    const region = projection.nodes.find((node) => node.kind === 'branch-region');
    const decision = projection.nodes.find((node) => node.kind === 'decision');
    const join = projection.nodes.find((node) => node.kind === 'join');
    expect(region?.isContainer).toBe(true);
    expect(projection.nodesById.get('a:1')?.parentId).toBe(region?.id);
    expect(projection.nodesById.get('a:2')?.parentId).toBe(region?.id);

    expect(
      projection.edges
        .filter((edge) => edge.source === decision?.id)
        .map((edge) => ({ label: edge.label, target: edge.target })),
    ).toEqual([
      { label: 'ok', target: 'a:1' },
      { label: 'else', target: 'a:2' },
    ]);
    expect(
      projection.edges
        .filter((edge) => edge.target === join?.id)
        .map((edge) => edge.source)
        .toSorted(),
    ).toEqual(['a:1', 'a:2']);
  });

  it('projects a loop as a region with a repeat back-edge to its header', () => {
    const projection = project(
      [
        {
          type: 'loop',
          id: 'l',
          loopKind: 'for-of',
          body: [{ type: 'command', id: 'c', commandId: 'a:1' }],
        },
      ],
      [activityCommand('a:1', 'eachItem', 0)],
    );

    const region = projection.nodes.find((node) => node.kind === 'loop-region');
    const header = projection.nodes.find((node) => node.kind === 'decision');
    expect(region?.label).toBe('loop (for-of)');
    expect(projection.nodesById.get('a:1')?.parentId).toBe(region?.id);
    // The forward edge into the body is unlabeled so it never stacks on top of
    // the `repeat` back-edge when the body is a single node (the "eac repeat" overlap).
    expect(
      projection.edges.some(
        (edge) => edge.source === header?.id && edge.target === 'a:1' && edge.label === '',
      ),
    ).toBe(true);
    expect(
      projection.edges.some(
        (edge) => edge.source === 'a:1' && edge.target === header?.id && edge.label === 'repeat',
      ),
    ).toBe(true);
  });

  it('projects a do-while so the exit condition follows the body, never a zero-iteration path', () => {
    const projection = project(
      [
        {
          type: 'loop',
          id: 'l',
          loopKind: 'do-while',
          body: [{ type: 'command', id: 'c', commandId: 'a:1' }],
        },
      ],
      [activityCommand('a:1', 'pollStatus', 0)],
    );

    // Regression: the body (pollStatus) must run before the condition header. Removing the
    // body from the edge set must make `complete` unreachable from the workflow entry —
    // there is no direct header→complete zero-iteration path.
    const complete = projection.nodes.find((node) => node.label === 'complete')?.id;
    const edges = projection.edges
      .filter((edge) => edge.source !== 'a:1' && edge.target !== 'a:1')
      .map((edge) => [edge.source, edge.target] as const);

    const reachable = new Set(['workflow:w']);
    for (let changed = true; changed;) {
      changed = false;
      for (const [from, to] of edges) {
        if (reachable.has(from) && !reachable.has(to)) {
          reachable.add(to);
          changed = true;
        }
      }
    }

    expect(complete).toBeDefined();
    expect(complete !== undefined && reachable.has(complete)).toBe(false);
  });

  it('projects a parallel region forking to and joining fixed branches', () => {
    const projection = project(
      [
        {
          type: 'parallel',
          id: 'p',
          parallelKind: 'race',
          cardinality: 'fixed',
          branches: [
            [{ type: 'command', id: 'c1', commandId: 'a:1' }],
            [{ type: 'command', id: 'c2', commandId: 'a:2' }],
          ],
        },
      ],
      [activityCommand('a:1', 'left', 0), activityCommand('a:2', 'right', 1)],
    );

    const region = projection.nodes.find((node) => node.kind === 'parallel-region');
    const fork = projection.nodes.find((node) => node.kind === 'parallel-fork');
    const join = projection.nodes.find((node) => node.kind === 'join');
    expect(region?.label).toBe('Promise.race');
    expect(projection.nodesById.get('a:1')?.parentId).toBe(region?.id);
    expect(
      projection.edges
        .filter((edge) => edge.source === fork?.id)
        .map((edge) => edge.target)
        .toSorted(),
    ).toEqual(['a:1', 'a:2']);
    expect(
      projection.edges
        .filter((edge) => edge.target === join?.id)
        .map((edge) => edge.source)
        .toSorted(),
    ).toEqual(['a:1', 'a:2']);
  });

  it('projects a dynamic parallel region with a single ×N template branch', () => {
    const projection = project(
      [
        {
          type: 'parallel',
          id: 'p',
          parallelKind: 'all',
          cardinality: 'dynamic',
          templateBranch: [{ type: 'command', id: 'c1', commandId: 'a:1' }],
        },
      ],
      [activityCommand('a:1', 'each', 0)],
    );

    const fork = projection.nodes.find((node) => node.kind === 'parallel-fork');
    expect(fork?.label).toBe('Promise.all');
    expect(
      projection.edges.find((edge) => edge.source === fork?.id && edge.target === 'a:1')?.label,
    ).toBe('×N');
  });

  it('projects a try region wrapping body, catch, and finally arms', () => {
    const projection = project(
      [
        {
          type: 'try',
          id: 't',
          body: [{ type: 'command', id: 'c1', commandId: 'a:1' }],
          handler: { body: [{ type: 'command', id: 'c2', commandId: 'a:2' }] },
          finalizer: [{ type: 'command', id: 'c3', commandId: 'a:3' }],
        },
      ],
      [
        activityCommand('a:1', 'work', 0),
        activityCommand('a:2', 'onError', 1),
        activityCommand('a:3', 'cleanup', 2),
      ],
    );

    const region = projection.nodes.find((node) => node.kind === 'try-region');
    for (const id of ['a:1', 'a:2', 'a:3']) {
      expect(projection.nodesById.get(id)?.parentId).toBe(region?.id);
    }
    expect(
      projection.edges.some((edge) => edge.source === 'workflow:w' && edge.target === 'a:1'),
    ).toBe(true);
    expect(
      projection.edges.find((edge) => edge.target === 'a:2' && edge.source === 'workflow:w')?.label,
    ).toBe('catch');
    expect(projection.edges.find((edge) => edge.target === 'a:3')?.label).toBe('finally');
  });

  it('routes a terminal inside a try/finally through the finalizer instead of dead-ending it', () => {
    // Regression: `return` in a try body used to dead-end, leaving the finalizer
    // (and everything after it) unreachable. `finally` runs on every exit, so the
    // terminal must connect to the finalizer's converge join.
    const projection = project(
      [
        {
          type: 'try',
          id: 't',
          body: [
            { type: 'command', id: 'c1', commandId: 'a:1' },
            { type: 'terminal', id: 'r', terminalKind: 'return' },
          ],
          finalizer: [{ type: 'command', id: 'c3', commandId: 'a:3' }],
        },
      ],
      [activityCommand('a:1', 'work', 0), activityCommand('a:3', 'cleanup', 1)],
    );

    const terminal = projection.nodes.find(
      (node) => node.kind === 'terminal' && node.label === 'return',
    );
    const converge = projection.edges.find((edge) => edge.target === 'a:3')?.source;
    expect(converge).toBeDefined();
    // The `return` reaches the finalizer converge, so `cleanup` is reachable from start.
    expect(
      projection.edges.some((edge) => edge.source === terminal?.id && edge.target === converge),
    ).toBe(true);
    expect(projection.edges.find((edge) => edge.target === 'a:3')?.label).toBe('finally');
  });

  it('projects a continue-as-new terminal that loops back to the workflow entry', () => {
    const projection = project(
      [
        { type: 'command', id: 'c1', commandId: 'a:1' },
        { type: 'terminal', id: 'tt', terminalKind: 'continue-as-new', commandId: 'can:1' },
      ],
      [
        activityCommand('a:1', 'work', 0),
        {
          id: 'can:1',
          kind: 'continue-as-new',
          name: 'loopWorkflow',
          source,
          confidence: 'exact',
          staticOrder: 1,
        },
      ],
    );

    // continue-as-new keeps its command identity (id/state) rather than becoming a neutral marker.
    const continueAsNew = projection.nodes.find((node) => node.kind === 'continue-as-new');
    expect(continueAsNew?.id).toBe('can:1');
    expect(continueAsNew?.label).toBe('loopWorkflow');
    // The terminal ends the path, so there is no trailing `complete` node.
    expect(projection.nodes.some((node) => node.label === 'complete')).toBe(false);
    expect(
      projection.edges.some(
        (edge) => edge.source === 'can:1' && edge.target === 'workflow:w' && edge.label === 'loop',
      ),
    ).toBe(true);
  });
});
