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
    expect(renderWorkflowMermaid(analysis, 'basicOrderWorkflow')).toContain(
      'start --> activity_call_basicOrderWorkflow_validateOrder_0',
    );
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
});
