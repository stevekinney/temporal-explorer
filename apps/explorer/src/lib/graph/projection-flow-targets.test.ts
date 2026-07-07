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

describe('control-flow projection target routing', () => {
  it('routes unlabeled breaks to an inner loop before an outer switch', () => {
    const projection = project(
      [
        {
          type: 'branch',
          id: 'switch',
          branchKind: 'switch',
          clauses: [
            {
              label: 'case 1',
              body: [
                {
                  type: 'loop',
                  id: 'loop',
                  loopKind: 'while',
                  body: [{ type: 'terminal', id: 'break', terminalKind: 'break' }],
                },
                { type: 'command', id: 'after-loop', commandId: 'a:after-loop' },
              ],
            },
          ],
        },
      ],
      [activityCommand('a:after-loop', 'afterLoop', 0)],
    );
    const breakNode = projection.nodes.find((node) => node.label === 'break');
    const afterLoop = projection.nodes.find((node) => node.id === 'a:after-loop');

    expect(afterLoop).toBeDefined();
    expect(reachableFrom(projection, breakNode?.id ?? '').has(afterLoop?.id ?? '')).toBe(true);
  });

  it('skips finalizers for breaks whose target remains inside the try', () => {
    const projection = project(
      [
        {
          type: 'try',
          id: 'try',
          body: [
            {
              type: 'loop',
              id: 'loop',
              loopKind: 'while',
              body: [{ type: 'terminal', id: 'break', terminalKind: 'break' }],
            },
            { type: 'command', id: 'after-loop', commandId: 'a:after-loop' },
          ],
          finalizer: [{ type: 'command', id: 'cleanup', commandId: 'a:cleanup' }],
        },
      ],
      [activityCommand('a:after-loop', 'afterLoop', 0), activityCommand('a:cleanup', 'cleanup', 1)],
    );
    const breakNode = projection.nodes.find((node) => node.label === 'break');
    const afterLoop = projection.nodes.find((node) => node.id === 'a:after-loop');
    const cleanup = projection.nodes.find((node) => node.id === 'a:cleanup');

    expect(afterLoop).toBeDefined();
    expect(cleanup).toBeDefined();
    expect(reachableFrom(projection, breakNode?.id ?? '').has(afterLoop?.id ?? '')).toBe(true);
    expect(
      projection.edges.some((edge) => edge.source === breakNode?.id && edge.target === cleanup?.id),
    ).toBe(false);
  });

  it('routes labeled breaks out of non-loop labeled regions', () => {
    const projection = project(
      [
        {
          type: 'region',
          id: 'outer',
          label: 'outer',
          body: [
            {
              type: 'branch',
              id: 'switch',
              branchKind: 'switch',
              clauses: [
                {
                  label: 'case 1',
                  body: [{ type: 'terminal', id: 'break', terminalKind: 'break', label: 'outer' }],
                },
              ],
            },
          ],
        },
        { type: 'command', id: 'after-region', commandId: 'a:after-region' },
      ],
      [activityCommand('a:after-region', 'afterRegion', 0)],
    );
    const breakNode = projection.nodes.find((node) => node.label === 'break outer');
    const afterRegion = projection.nodes.find((node) => node.id === 'a:after-region');

    expect(afterRegion).toBeDefined();
    expect(reachableFrom(projection, breakNode?.id ?? '').has(afterRegion?.id ?? '')).toBe(true);
  });

  it('keeps normal and abrupt finalizer command copies distinct', () => {
    const projection = project(
      [
        {
          type: 'try',
          id: 'try',
          body: [
            {
              type: 'branch',
              id: 'branch',
              branchKind: 'if',
              clauses: [
                {
                  label: 'stop',
                  body: [{ type: 'terminal', id: 'return', terminalKind: 'return' }],
                },
              ],
              otherwise: [{ type: 'command', id: 'work', commandId: 'a:work' }],
            },
          ],
          finalizer: [{ type: 'command', id: 'cleanup', commandId: 'a:cleanup' }],
        },
      ],
      [activityCommand('a:work', 'work', 0), activityCommand('a:cleanup', 'cleanup', 1)],
    );
    const cleanupNodes = projection.nodes.filter((node) => node.label === 'cleanup');

    expect(cleanupNodes).toHaveLength(2);
    expect(new Set(cleanupNodes.map((node) => node.id)).size).toBe(2);
  });
});
