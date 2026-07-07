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

describe('Mermaid control-flow target routing', () => {
  it('routes unlabeled breaks to the innermost loop target', async () => {
    const analysis = await loadBasicOrderAnalysis();
    const target = analysis.workflows[0];
    if (!target) throw new Error('Expected a Workflow fixture.');

    target.temporalCommands = [
      {
        id: 'after-loop',
        kind: 'activity',
        name: 'afterLoop',
        source,
        confidence: 'exact',
        staticOrder: 0,
      },
    ];
    target.body.nodes = [
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
                body: [{ type: 'terminal', id: 'break-node', terminalKind: 'break' }],
              },
              { type: 'command', id: 'after-loop-node', commandId: 'after-loop' },
            ],
          },
        ],
      },
    ];

    const mermaid = renderWorkflowMermaid(analysis, target.name);
    const breakNode = mermaid.match(/^ {2}(\S+)\(\["break"\]\)$/m)?.[1];
    const afterLoop = mermaid.match(/^ {2}(\S+)\["afterLoop"\]$/m)?.[1];
    if (!breakNode || !afterLoop) throw new Error('Expected break and afterLoop nodes.');

    expect(reachableFromNode(mermaid, breakNode).has(afterLoop)).toBe(true);
  });

  it('skips finalizers for breaks whose target stays inside the try', async () => {
    const analysis = await loadBasicOrderAnalysis();
    const target = analysis.workflows[0];
    if (!target) throw new Error('Expected a Workflow fixture.');

    target.temporalCommands = [
      {
        id: 'after-loop',
        kind: 'activity',
        name: 'afterLoop',
        source,
        confidence: 'exact',
        staticOrder: 0,
      },
      {
        id: 'cleanup',
        kind: 'activity',
        name: 'cleanup',
        source,
        confidence: 'exact',
        staticOrder: 1,
      },
    ];
    target.body.nodes = [
      {
        type: 'try',
        id: 'try-node',
        body: [
          {
            type: 'loop',
            id: 'loop',
            loopKind: 'while',
            body: [{ type: 'terminal', id: 'break-node', terminalKind: 'break' }],
          },
          { type: 'command', id: 'after-loop-node', commandId: 'after-loop' },
        ],
        finalizer: [{ type: 'command', id: 'cleanup-node', commandId: 'cleanup' }],
      },
    ];

    const mermaid = renderWorkflowMermaid(analysis, target.name);
    const breakNode = mermaid.match(/^ {2}(\S+)\(\["break"\]\)$/m)?.[1];
    const afterLoop = mermaid.match(/^ {2}(\S+)\["afterLoop"\]$/m)?.[1];
    if (!breakNode || !afterLoop) throw new Error('Expected break and afterLoop nodes.');

    expect(reachableFromNode(mermaid, breakNode).has(afterLoop)).toBe(true);
    expect(mermaid).not.toMatch(/break_node -->\|"finally"\| cleanup_node/);
  });

  it('routes labeled breaks out of non-loop regions', async () => {
    const analysis = await loadBasicOrderAnalysis();
    const target = analysis.workflows[0];
    if (!target) throw new Error('Expected a Workflow fixture.');

    target.temporalCommands = [
      {
        id: 'after-region',
        kind: 'activity',
        name: 'afterRegion',
        source,
        confidence: 'exact',
        staticOrder: 0,
      },
    ];
    target.body.nodes = [
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
                body: [
                  { type: 'terminal', id: 'break-node', terminalKind: 'break', label: 'outer' },
                ],
              },
            ],
          },
        ],
      },
      { type: 'command', id: 'after-region-node', commandId: 'after-region' },
    ];

    const mermaid = renderWorkflowMermaid(analysis, target.name);
    const breakNode = mermaid.match(/^ {2}(\S+)\(\["break outer"\]\)$/m)?.[1];
    const afterRegion = mermaid.match(/^ {2}(\S+)\["afterRegion"\]$/m)?.[1];
    if (!breakNode || !afterRegion) throw new Error('Expected break outer and afterRegion nodes.');

    expect(reachableFromNode(mermaid, breakNode).has(afterRegion)).toBe(true);
  });

  it('keeps normal and abrupt finalizer ids distinct', async () => {
    const analysis = await loadBasicOrderAnalysis();
    const target = analysis.workflows[0];
    if (!target) throw new Error('Expected a Workflow fixture.');

    target.temporalCommands = [
      { id: 'work', kind: 'activity', name: 'work', source, confidence: 'exact', staticOrder: 0 },
      {
        id: 'cleanup',
        kind: 'activity',
        name: 'cleanup',
        source,
        confidence: 'exact',
        staticOrder: 1,
      },
    ];
    target.body.nodes = [
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
                body: [{ type: 'terminal', id: 'return-node', terminalKind: 'return' }],
              },
            ],
            otherwise: [{ type: 'command', id: 'work-node', commandId: 'work' }],
          },
        ],
        finalizer: [{ type: 'command', id: 'cleanup-node', commandId: 'cleanup' }],
      },
    ];

    const mermaid = renderWorkflowMermaid(analysis, target.name);
    const cleanupIds = [...mermaid.matchAll(/^ {2}(\S+)\["cleanup"\]$/gm)].map((match) => match[1]);

    expect(cleanupIds).toHaveLength(2);
    expect(new Set(cleanupIds).size).toBe(2);
  });
});
