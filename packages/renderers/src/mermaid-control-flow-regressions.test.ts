import { describe, expect, it } from 'bun:test';

import { temporalAnalysisDocumentSchema } from '@temporal-explorer/schemas';

import { renderWorkflowMermaid } from './index';

const fixtureRoot = new URL('../../../fixtures/basic-order/', import.meta.url);
const source = {
  path: 'src/workflows.ts',
  pathKind: 'project-relative' as const,
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

function sourceSpan(start: number, end: number): typeof source {
  return {
    ...source,
    start: { line: 1, column: start + 1, offset: start },
    end: { line: 1, column: end + 1, offset: end },
  };
}

function reachableFromNode(mermaid: string, start: string): Set<string> {
  const edges = [...mermaid.matchAll(/^ {2}(\S+) -->(?:\|[^|]*\|)? (\S+)$/gm)].flatMap(
    (match): [string, string][] => {
      const from = match[1];
      const to = match[2];
      return from && to ? [[from, to]] : [];
    },
  );
  const reachable = new Set([start]);

  for (let changed = true; changed;) {
    changed = false;

    for (const [from, to] of edges) {
      if (reachable.has(from) && !reachable.has(to)) {
        reachable.add(to);
        changed = true;
      }
    }
  }

  return reachable;
}

async function loadBasicOrderAnalysis() {
  return temporalAnalysisDocumentSchema.parse(
    await Bun.file(new URL('.temporal-explorer/analysis.json', fixtureRoot)).json(),
  );
}

describe('Mermaid control-flow regression cases', () => {
  it('keeps fallback commands inside an abrupt structured region in Mermaid', async () => {
    const analysis = await loadBasicOrderAnalysis();
    const target = analysis.workflows[0];

    if (!target) {
      throw new Error('Expected a Workflow fixture.');
    }

    target.temporalCommands = [
      {
        id: 'inside',
        kind: 'activity',
        name: 'insideFallback',
        source,
        confidence: 'exact',
        staticOrder: 0,
      },
      {
        id: 'outside',
        kind: 'activity',
        name: 'outsideAfterReturn',
        source,
        confidence: 'exact',
        staticOrder: 1,
      },
    ];
    target.body.nodes = [
      {
        type: 'try',
        id: 'try-node',
        source: sourceSpan(0, 100),
        body: [{ type: 'terminal', id: 'return-node', terminalKind: 'return' }],
      },
      { type: 'command', id: 'inside-node', commandId: 'inside', source: sourceSpan(10, 20) },
      { type: 'command', id: 'outside-node', commandId: 'outside', source: sourceSpan(120, 130) },
    ];

    const mermaid = renderWorkflowMermaid(analysis, target.name);

    expect(mermaid).toContain('["insideFallback"]');
    expect(mermaid).not.toContain('["outsideAfterReturn"]');
  });

  it('starts catch arms from the try entry in Mermaid', async () => {
    const analysis = await loadBasicOrderAnalysis();
    const target = analysis.workflows[0];

    if (!target) {
      throw new Error('Expected a Workflow fixture.');
    }

    target.temporalCommands = [
      { id: 'body', kind: 'activity', name: 'body', source, confidence: 'exact', staticOrder: 0 },
      {
        id: 'handler',
        kind: 'activity',
        name: 'handler',
        source,
        confidence: 'exact',
        staticOrder: 1,
      },
    ];
    target.body.nodes = [
      {
        type: 'try',
        id: 'try-node',
        body: [{ type: 'command', id: 'body-node', commandId: 'body' }],
        handler: { body: [{ type: 'command', id: 'handler-node', commandId: 'handler' }] },
      },
    ];

    const mermaid = renderWorkflowMermaid(analysis, target.name);

    expect(mermaid).toContain('start -->|"catch"| handler_node');
    expect(mermaid).not.toContain('body_node -->|"catch"| handler_node');
  });

  it('routes nested switch breaks to the switch join in Mermaid', async () => {
    const analysis = await loadBasicOrderAnalysis();
    const target = analysis.workflows[0];

    if (!target) {
      throw new Error('Expected a Workflow fixture.');
    }

    target.temporalCommands = [
      {
        id: 'after-switch',
        kind: 'activity',
        name: 'afterSwitch',
        source,
        confidence: 'exact',
        staticOrder: 0,
      },
    ];
    target.body.nodes = [
      {
        type: 'loop',
        id: 'loop',
        loopKind: 'while',
        body: [
          {
            type: 'branch',
            id: 'switch',
            branchKind: 'switch',
            clauses: [
              {
                label: 'case 1',
                body: [
                  {
                    type: 'try',
                    id: 'nested',
                    body: [{ type: 'terminal', id: 'break-node', terminalKind: 'break' }],
                  },
                ],
              },
            ],
          },
          { type: 'command', id: 'after-switch-node', commandId: 'after-switch' },
        ],
      },
    ];

    const mermaid = renderWorkflowMermaid(analysis, target.name);
    const breakNode = mermaid.match(/^ {2}(\S+)\(\["break"\]\)$/m)?.[1];
    const afterSwitch = mermaid.match(/^ {2}(\S+)\["afterSwitch"\]$/m)?.[1];

    if (!breakNode) {
      throw new Error('Expected break terminal in Mermaid output.');
    }

    if (!afterSwitch) {
      throw new Error('Expected afterSwitch in Mermaid output.');
    }

    expect(reachableFromNode(mermaid, breakNode).has(afterSwitch)).toBe(true);
  });

  it('uses unique ids for duplicated finalizer paths in Mermaid', async () => {
    const analysis = await loadBasicOrderAnalysis();
    const target = analysis.workflows[0];

    if (!target) {
      throw new Error('Expected a Workflow fixture.');
    }

    target.temporalCommands = [
      {
        id: 'cleanup',
        kind: 'activity',
        name: 'cleanup',
        source,
        confidence: 'exact',
        staticOrder: 0,
      },
    ];
    target.body.nodes = [
      {
        type: 'loop',
        id: 'loop',
        loopKind: 'while',
        body: [
          {
            type: 'try',
            id: 'try-node',
            body: [
              {
                type: 'branch',
                id: 'branch-node',
                branchKind: 'if',
                clauses: [
                  {
                    label: 'stop',
                    body: [{ type: 'terminal', id: 'break-node', terminalKind: 'break' }],
                  },
                ],
                otherwise: [{ type: 'terminal', id: 'continue-node', terminalKind: 'continue' }],
              },
            ],
            finalizer: [{ type: 'command', id: 'cleanup-node', commandId: 'cleanup' }],
          },
        ],
      },
    ];

    const mermaid = renderWorkflowMermaid(analysis, target.name);
    const cleanupIds = [...mermaid.matchAll(/^ {2}(\S+)\["cleanup"\]$/gm)].map((match) => match[1]);

    expect(cleanupIds).toHaveLength(2);
    expect(new Set(cleanupIds).size).toBe(2);
  });
});
