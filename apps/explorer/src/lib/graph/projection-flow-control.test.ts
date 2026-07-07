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

function activityCommand(id: string, name: string, staticOrder: number): TemporalCommand {
  return { id, kind: 'activity', name, source, confidence: 'exact', staticOrder };
}

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

function reachableFrom(projection: GraphProjection, start: string): Set<string> {
  const reachable = new Set([start]);

  for (let changed = true; changed;) {
    changed = false;

    for (const edge of projection.edges) {
      if (reachable.has(edge.source) && !reachable.has(edge.target)) {
        reachable.add(edge.target);
        changed = true;
      }
    }
  }

  return reachable;
}

describe('control-flow projection terminal routing', () => {
  it('routes break and continue terminals through loop control targets', () => {
    const projection = project(
      [
        {
          type: 'loop',
          id: 'l',
          loopKind: 'while',
          body: [
            { type: 'command', id: 'c1', commandId: 'a:1' },
            {
              type: 'branch',
              id: 'branch',
              branchKind: 'if',
              clauses: [
                {
                  label: 'again',
                  body: [{ type: 'terminal', id: 'continue', terminalKind: 'continue' }],
                },
              ],
              otherwise: [{ type: 'terminal', id: 'break', terminalKind: 'break' }],
            },
          ],
        },
      ],
      [activityCommand('a:1', 'work', 0)],
    );

    const header = projection.nodes.find((node) => node.kind === 'decision');
    const loopExit = projection.edges.find(
      (edge) => edge.source === header?.id && edge.label === 'done',
    )?.target;
    const continueNode = projection.nodes.find((node) => node.label === 'continue');
    const breakNode = projection.nodes.find((node) => node.label === 'break');

    expect(header).toBeDefined();
    expect(loopExit).toBeDefined();
    expect(
      projection.edges.some(
        (edge) => edge.source === continueNode?.id && edge.target === header?.id,
      ),
    ).toBe(true);
    expect(
      projection.edges.some((edge) => edge.source === breakNode?.id && edge.target === loopExit),
    ).toBe(true);
  });

  it('routes a terminal inside a try/finally through the finalizer instead of dead-ending it', () => {
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
    const cleanup = projection.nodes.find((node) => node.label === 'cleanup');

    expect(cleanup).toBeDefined();
    expect(reachableFrom(projection, terminal?.id ?? '').has(cleanup?.id ?? '')).toBe(true);
    expect(projection.edges.find((edge) => edge.target === cleanup?.id)?.label).toBe('finally');
  });

  it('does not let a return after finally fall through to later siblings', () => {
    const projection = project(
      [
        {
          type: 'try',
          id: 't',
          body: [
            { type: 'command', id: 'c1', commandId: 'a:1' },
            { type: 'terminal', id: 'r', terminalKind: 'return' },
          ],
          finalizer: [{ type: 'command', id: 'c2', commandId: 'a:2' }],
        },
        { type: 'command', id: 'c3', commandId: 'a:3' },
      ],
      [
        activityCommand('a:1', 'work', 0),
        activityCommand('a:2', 'cleanup', 1),
        activityCommand('a:3', 'after', 2),
      ],
    );

    const terminal = projection.nodes.find(
      (node) => node.kind === 'terminal' && node.label === 'return',
    );
    const cleanup = projection.nodes.find((node) => node.label === 'cleanup');

    expect(terminal).toBeDefined();
    expect(cleanup).toBeDefined();
    expect(reachableFrom(projection, terminal?.id ?? '').has(cleanup?.id ?? '')).toBe(true);
    expect(projection.nodes.some((node) => node.label === 'after')).toBe(false);
  });
});
