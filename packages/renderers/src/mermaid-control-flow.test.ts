import { describe, expect, it } from 'bun:test';

import { temporalAnalysisDocumentSchema } from '@temporal-explorer/schemas';

import { renderWorkflowMermaid } from './index';

const fixtureRoot = new URL('../../../fixtures/basic-order/', import.meta.url);

function reachableFromStart(mermaid: string, exclude?: string): Set<string> {
  const edges = [...mermaid.matchAll(/^ {2}(\S+) -->(?:\|[^|]*\|)? (\S+)$/gm)].flatMap(
    (match): [string, string][] => {
      const from = match[1];
      const to = match[2];
      return from && to ? [[from, to]] : [];
    },
  );
  const reachable = new Set(['start']);

  for (let changed = true; changed;) {
    changed = false;

    for (const [from, to] of edges) {
      if (from === exclude || to === exclude) {
        continue;
      }

      if (reachable.has(from) && !reachable.has(to)) {
        reachable.add(to);
        changed = true;
      }
    }
  }

  return reachable;
}

describe('Mermaid control-flow rendering', () => {
  it('renders branches from the control-flow model instead of a flat chain', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/patched/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const mermaid = renderWorkflowMermaid(analysis, 'patchedWorkflow');

    expect(mermaid).toContain('{"use-modern-charge"}');
    expect(mermaid).toContain('-->|"else"|');
    expect(mermaid).toContain('["newCharge"]');
    expect(mermaid).toContain('["oldCharge"]');
    expect(mermaid).not.toMatch(/newCharge.*-->.*oldCharge/);
  });

  it('keeps a try/finally finalizer reachable when the try body returns', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/try-finally/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const mermaid = renderWorkflowMermaid(analysis, 'chargeWorkflow');
    const releaseLock = mermaid.match(/^ {2}(\S+)\["releaseLock"\]$/m)?.[1];

    if (!releaseLock) {
      throw new Error('Expected releaseLock in Mermaid output.');
    }

    expect(reachableFromStart(mermaid).has(releaseLock)).toBe(true);
    expect(mermaid).toContain('|"finally"|');
  });

  it('renders a do-while so the loop exit is unreachable without running the body', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL(
          '../../../fixtures/do-while-loop/.temporal-explorer/analysis.json',
          import.meta.url,
        ),
      ).json(),
    );
    const mermaid = renderWorkflowMermaid(analysis, 'pollWorkflow');
    const body = mermaid.match(/^ {2}(\S+)\["pollStatus"\]$/m)?.[1];

    expect(body).toBeDefined();
    expect(reachableFromStart(mermaid, body).has('complete')).toBe(false);
  });

  it('routes loop-control terminals and preserves abrupt finally exits in Mermaid', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(new URL('.temporal-explorer/analysis.json', fixtureRoot)).json(),
    );
    const workflow = analysis.workflows[0];

    if (!workflow) {
      throw new Error('Expected a Workflow fixture.');
    }

    const mutated = structuredClone(analysis);
    const target = mutated.workflows[0];

    if (!target) {
      throw new Error('Expected a Workflow fixture.');
    }

    target.temporalCommands = [
      {
        id: 'work',
        kind: 'activity',
        name: 'work',
        source: workflow.source,
        confidence: 'exact',
        staticOrder: 0,
      },
      {
        id: 'cleanup',
        kind: 'activity',
        name: 'cleanup',
        source: workflow.source,
        confidence: 'exact',
        staticOrder: 1,
      },
      {
        id: 'after',
        kind: 'activity',
        name: 'after',
        source: workflow.source,
        confidence: 'exact',
        staticOrder: 2,
      },
    ];
    target.body.nodes = [
      {
        type: 'loop',
        id: 'loop',
        loopKind: 'while',
        body: [
          { type: 'command', id: 'work-node', commandId: 'work' },
          {
            type: 'branch',
            id: 'branch-node',
            branchKind: 'if',
            clauses: [
              {
                label: 'again',
                body: [{ type: 'terminal', id: 'continue-node', terminalKind: 'continue' }],
              },
            ],
            otherwise: [{ type: 'terminal', id: 'break-node', terminalKind: 'break' }],
          },
        ],
      },
      {
        type: 'try',
        id: 'try-node',
        body: [{ type: 'terminal', id: 'return-node', terminalKind: 'return' }],
        finalizer: [{ type: 'command', id: 'cleanup-node', commandId: 'cleanup' }],
      },
      { type: 'command', id: 'after-node', commandId: 'after' },
    ];

    const mermaid = renderWorkflowMermaid(mutated, target.name);
    const cleanup = mermaid.match(/^ {2}(\S+)\["cleanup"\]$/m)?.[1];

    if (!cleanup) {
      throw new Error('Expected cleanup in Mermaid output.');
    }

    expect(mermaid).toMatch(/continue_node --> loop/);
    expect(mermaid).toMatch(/break_node --> n\d+/);
    expect(reachableFromStart(mermaid).has(cleanup)).toBe(true);
    expect(mermaid).not.toContain('["after"]');
  });

  it('renders continueAsNew as a loop-back terminal, not a chain into complete', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL(
          '../../../fixtures/continue-as-new/.temporal-explorer/analysis.json',
          import.meta.url,
        ),
      ).json(),
    );
    const mermaid = renderWorkflowMermaid(analysis, 'continueAsNewWorkflow');

    expect(mermaid).toContain('continue as new');
    expect(mermaid).toContain('-->|"loop"| start');
  });
});
