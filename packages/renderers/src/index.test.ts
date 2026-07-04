import { describe, expect, it } from 'bun:test';

import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
} from '@temporal-explorer/schemas';

import { createDocumentationSet, renderWorkflowDeclaration, renderWorkflowMermaid } from './index';

const fixtureRoot = new URL('../../../fixtures/basic-order/', import.meta.url);

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
