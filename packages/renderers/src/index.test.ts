import { describe, expect, it } from 'bun:test';

import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
  type TemporalAnalysisDocument,
} from '@temporal-explorer/schemas';

import {
  createDocumentationSet,
  getWorkflow,
  renderWorkflowDeclaration,
  renderWorkflowMermaid,
} from './index';

const fixtureRoot = new URL('../../../fixtures/basic-order/', import.meta.url);

/** Node ids reachable from `start` in a Mermaid flowchart, optionally with one node removed. */
function reachableFromStart(mermaid: string, exclude?: string): Set<string> {
  const edges = [...mermaid.matchAll(/^ {2}(\S+) -->(?:\|[^|]*\|)? (\S+)$/gm)]
    .map((match) => [match[1], match[2]] as [string, string])
    .filter(([from, to]) => from !== exclude && to !== exclude);
  const reachable = new Set(['start']);
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

describe('documentation renderers', () => {
  it('renders deterministic Markdown and Mermaid documentation', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(new URL('.temporal-explorer/analysis.json', fixtureRoot)).json(),
    );
    const trace = runtimeTraceDocumentSchema.parse(
      await Bun.file(
        new URL('.temporal-explorer/histories/success.trace.json', fixtureRoot),
      ).json(),
    );
    const overlay = executionOverlayDocumentSchema.parse(
      await Bun.file(
        new URL('.temporal-explorer/overlays/success.overlay.json', fixtureRoot),
      ).json(),
    );
    const firstRender = createDocumentationSet({ analysis, traces: [trace], overlays: [overlay] });
    const secondRender = createDocumentationSet({ analysis, traces: [trace], overlays: [overlay] });
    const workflowMarkdown = firstRender.find((file) => file.path === 'basicOrderWorkflow.md');

    expect(firstRender).toEqual(secondRender);
    expect(workflowMarkdown?.contents).toContain('|     1 | `validateOrder` |');
    expect(workflowMarkdown?.contents).toContain('Payload previews: redacted by default');
    expect(workflowMarkdown?.contents).not.toContain('/Users/');
    const mermaid = renderWorkflowMermaid(analysis, 'basicOrderWorkflow');
    expect(mermaid).toContain('start(["basicOrderWorkflow"])');
    expect(mermaid).toContain('["validateOrder"]');
    expect(mermaid).toContain('--> complete');
  });

  it('renders missing runtime overlays and workflow diagnostics', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(new URL('.temporal-explorer/analysis.json', fixtureRoot)).json(),
    );
    const analysisWithDiagnostic = structuredClone(analysis);
    const workflow = analysisWithDiagnostic.workflows[0];

    if (!workflow) {
      throw new Error('Expected a Workflow fixture.');
    }

    workflow.diagnostics.push({
      code: 'TEA_DYNAMIC_ACTIVITY_CALL',
      category: 'control-flow',
      severity: 'warning',
      message: 'Dynamic Activity call could not be fully resolved.',
      confidence: 'dynamic',
    });

    const documentation = createDocumentationSet({ analysis: analysisWithDiagnostic });
    const workflowMarkdown = documentation.find((file) => file.path === 'basicOrderWorkflow.md');

    expect(workflowMarkdown?.contents).toContain('- No runtime overlay artifact was provided.');
    expect(workflowMarkdown?.contents).toContain(
      '- warning: Dynamic Activity call could not be fully resolved.',
    );
    expect(() => renderWorkflowMermaid(analysisWithDiagnostic, 'missingWorkflow')).toThrow(
      'Workflow "missingWorkflow" was not found.',
    );
  });

  it('sorts workflow index entries by Workflow name', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(new URL('.temporal-explorer/analysis.json', fixtureRoot)).json(),
    );
    const analysisWithSecondWorkflow = structuredClone(analysis);
    const workflow = analysisWithSecondWorkflow.workflows[0];

    if (!workflow) {
      throw new Error('Expected a Workflow fixture.');
    }

    analysisWithSecondWorkflow.workflows.push({
      ...structuredClone(workflow),
      id: 'workflow:aaaWorkflow',
      name: 'aaaWorkflow',
      temporalCommands: [],
    });

    const index = createDocumentationSet({ analysis: analysisWithSecondWorkflow }).find(
      (file) => file.path === 'index.md',
    );

    if (!index) {
      throw new Error('Expected an index documentation file.');
    }

    expect(index.contents.indexOf('aaaWorkflow')).toBeLessThan(
      index.contents.indexOf('basicOrderWorkflow'),
    );
  });

  it('renders branches from the control-flow model instead of a flat chain', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/patched/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const mermaid = renderWorkflowMermaid(analysis, 'patchedWorkflow');

    // The patched() gate is a branch: exactly one of newCharge/oldCharge, not both in a line.
    expect(mermaid).toContain('{"use-modern-charge"}');
    expect(mermaid).toContain('-->|"else"|');
    expect(mermaid).toContain('["newCharge"]');
    expect(mermaid).toContain('["oldCharge"]');
    // Old linear behavior chained newCharge directly into oldCharge; it must not.
    expect(mermaid).not.toMatch(/newCharge.*-->.*oldCharge/);
  });

  it('keeps a try/finally finalizer reachable when the try body returns', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/try-finally/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const mermaid = renderWorkflowMermaid(analysis, 'chargeWorkflow');

    // Regression: `return` in the try body used to dead-end, leaving the `finally`
    // block (releaseLock) unreachable from `start`.
    const releaseLock = mermaid.match(/^ {2}(\S+)\["releaseLock"\]$/m)?.[1];
    expect(releaseLock).toBeDefined();
    expect(reachableFromStart(mermaid).has(releaseLock as string)).toBe(true);
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

    // Regression: a do-while used to draw `header --> complete`, implying a zero-iteration
    // path. The body must run first. Prove `complete` is unreachable from `start` once the
    // body activity (pollStatus) is removed.
    const body = mermaid.match(/^ {2}(\S+)\["pollStatus"\]$/m)?.[1];
    expect(body).toBeDefined();
    expect(reachableFromStart(mermaid, body).has('complete')).toBe(false);
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

  it('renders deterministic import-preserving workflow declarations', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/update/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const first = renderWorkflowDeclaration(analysis, 'updateWorkflow');
    const second = renderWorkflowDeclaration(analysis, 'updateWorkflow');

    expect(first).toBe(second);
    expect(first).toContain(
      "import type { ShippingAddress, UpdateFixtureInput, UpdateFixtureResult } from '../../src/activities/address-activities';",
    );
    expect(first).toContain(
      'export declare function updateWorkflow(input: UpdateFixtureInput): Promise<UpdateFixtureResult>;',
    );
    expect(first).toContain(
      "export declare const setAddressUpdate: import('@temporalio/workflow').UpdateDefinition<ShippingAddress, [ShippingAddress]>;",
    );
    expect(first).toContain('[confidence: exact]');
    expect(() => renderWorkflowDeclaration(analysis, 'missing')).toThrow(
      'Workflow "missing" was not found.',
    );
  });

  it('renders ...rest and ?optional parameters in declarations and signatures', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(new URL('.temporal-explorer/analysis.json', fixtureRoot)).json(),
    );
    const mutated = structuredClone(analysis);
    const workflow = mutated.workflows[0];
    const [firstArg] = workflow?.signature.args ?? [];

    if (!workflow || !firstArg) {
      throw new Error('Expected a Workflow fixture with a signature argument.');
    }

    workflow.signature.args = [
      { ...firstArg, displayName: 'items', display: 'string[]', isRest: true },
      {
        ...firstArg,
        id: 'restWorkflow:arg:1:flag',
        displayName: 'flag',
        display: 'boolean',
        optional: true,
      },
    ];

    const declaration = renderWorkflowDeclaration(mutated, workflow.name);
    expect(declaration).toContain('...items: string[]');
    expect(declaration).toContain('flag?: boolean');

    const markdown = createDocumentationSet({ analysis: mutated }).find(
      (file) => file.path === `${workflow.name}.md`,
    );
    expect(markdown?.contents).toContain('...items: string[]');
    expect(markdown?.contents).toContain('flag?: boolean');
  });

  it('marks deprecatePatch commands as deprecated in Mermaid and Markdown', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(
        new URL('../../../fixtures/patched/.temporal-explorer/analysis.json', import.meta.url),
      ).json(),
    );
    const mutated = structuredClone(analysis);
    const legacy = mutated.workflows[0]?.temporalCommands.find(
      (command) => command.name === 'legacy-tax-rounding',
    );

    if (!legacy) {
      throw new Error('Expected the legacy-tax-rounding patch command.');
    }

    legacy.deprecated = true;

    const mermaid = renderWorkflowMermaid(mutated, 'patchedWorkflow');
    expect(mermaid).toContain('legacy-tax-rounding (deprecated)');
    // The non-deprecated patched() gate stays unmarked.
    expect(mermaid).toContain('{"use-modern-charge"}');
    expect(mermaid).not.toContain('use-modern-charge (deprecated)');

    const markdown = createDocumentationSet({ analysis: mutated }).find(
      (file) => file.path === 'patchedWorkflow.md',
    );
    expect(markdown?.contents).toContain('`legacy-tax-rounding` (deprecated)');
  });

  it('disambiguates the complete sentinel when a command id would collide', async () => {
    const analysis = temporalAnalysisDocumentSchema.parse(
      await Bun.file(new URL('.temporal-explorer/analysis.json', fixtureRoot)).json(),
    );
    const mutated = structuredClone(analysis);
    const workflow = mutated.workflows[0];
    const [command] = workflow?.temporalCommands ?? [];

    if (!workflow || !command) {
      throw new Error('Expected a Workflow fixture with a command.');
    }

    workflow.body.nodes = []; // Force the linear render path.
    command.id = 'complete';
    command.name = 'complete';

    const mermaid = renderWorkflowMermaid(mutated, workflow.name);
    expect(mermaid).toContain('complete["complete"]'); // The activity keeps the id.
    expect(mermaid).toContain('complete_1(["complete"])'); // The sentinel relocates.
    expect(mermaid).toContain('--> complete_1');
  });
});

describe('versioned workflows that share a registered name', () => {
  // Builds an analysis document shaped like the worker-versioning sample: two
  // distinct implementations both registered under the display name
  // "AutoUpgrading", disambiguated only by their implementation name / id.
  async function aliasedAnalysis(): Promise<TemporalAnalysisDocument> {
    const base = temporalAnalysisDocumentSchema.parse(
      await Bun.file(new URL('.temporal-explorer/analysis.json', fixtureRoot)).json(),
    );
    const template = base.workflows[0];

    if (!template) {
      throw new Error('Expected a Workflow fixture.');
    }

    const version = (
      implementationName: string,
    ): TemporalAnalysisDocument['workflows'][number] => ({
      ...structuredClone(template),
      id: `workflow:${implementationName}`,
      name: 'AutoUpgrading',
      implementationName,
    });

    return {
      ...structuredClone(base),
      workflows: [version('autoUpgradingV1'), version('autoUpgradingV1b')],
    };
  }

  it('gives each implementation a distinct doc file instead of overwriting by name', async () => {
    const files = createDocumentationSet({ analysis: await aliasedAnalysis() });
    const paths = files.map((file) => file.path);

    // The class bug: two "AutoUpgrading" workflows would both write AutoUpgrading.md.
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('autoUpgradingV1.md');
    expect(paths).toContain('autoUpgradingV1b.md');
    expect(paths).toContain('autoUpgradingV1.mmd');
    expect(paths).toContain('autoUpgradingV1b.mmd');
    expect(paths).not.toContain('AutoUpgrading.md');

    // The index links the unique slugs but shows the registered display name.
    const index = files.find((file) => file.path === 'index.md');
    expect(index?.contents).toContain('[AutoUpgrading](./autoUpgradingV1.md)');
    expect(index?.contents).toContain('[AutoUpgrading](./autoUpgradingV1b.md)');
  });

  it('resolves getWorkflow by unique slug and rejects an ambiguous display name', async () => {
    const analysis = await aliasedAnalysis();

    expect(getWorkflow(analysis, 'autoUpgradingV1').implementationName).toBe('autoUpgradingV1');
    expect(getWorkflow(analysis, 'autoUpgradingV1b').implementationName).toBe('autoUpgradingV1b');
    expect(() => getWorkflow(analysis, 'AutoUpgrading')).toThrow('is ambiguous');
  });
});
