import { describe, expect, it } from 'bun:test';

import {
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
} from '@temporal-explorer/schemas';

import { createExecutionOverlay } from './index';

async function loadFixtureArtifact<T>(
  fixture: string,
  file: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const url = new URL(`../../../fixtures/${fixture}/.temporal-explorer/${file}`, import.meta.url);
  return parse(await Bun.file(url).json());
}

describe('repeated-command mapping', () => {
  it('maps every fan-out execution to its single dynamic-parallel template node', async () => {
    const analysis = await loadFixtureArtifact('dynamic-parallel', 'analysis.json', (value) =>
      temporalAnalysisDocumentSchema.parse(value),
    );
    const trace = await loadFixtureArtifact(
      'dynamic-parallel',
      'histories/fanned-out.trace.json',
      (value) => runtimeTraceDocumentSchema.parse(value),
    );
    const overlay = createExecutionOverlay({ analysis, trace, workflowName: 'broadcastWorkflow' });
    const deliverMappings = overlay.mappings.filter((mapping) =>
      mapping.runtimeOperationId.startsWith('activity:deliverToChannel:'),
    );

    // `Promise.all(channels.map(...))` fans one static template out to three runtime executions;
    // all three must map back to that template so none become disconnected, unmapped orphan nodes.
    expect(deliverMappings).toHaveLength(3);
    expect(new Set(deliverMappings.map((mapping) => mapping.staticNodeId)).size).toBe(1);
    expect(deliverMappings.every((mapping) => mapping.confidence === 'exact')).toBe(true);
    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(0);
  });

  it('maps every loop iteration back to its single counting-loop body node', async () => {
    const analysis = await loadFixtureArtifact('counting-loop', 'analysis.json', (value) =>
      temporalAnalysisDocumentSchema.parse(value),
    );
    const trace = await loadFixtureArtifact(
      'counting-loop',
      'histories/iterated.trace.json',
      (value) => runtimeTraceDocumentSchema.parse(value),
    );
    const overlay = createExecutionOverlay({ analysis, trace, workflowName: 'batchWorkflow' });
    const iterationMappings = overlay.mappings.filter((mapping) =>
      mapping.runtimeOperationId.startsWith('activity:processItem:'),
    );

    // The `for` loop runs `processItem` three times; all three executions must map back to the
    // single static loop-body node so none become disconnected orphan nodes.
    expect(iterationMappings).toHaveLength(3);
    expect(new Set(iterationMappings.map((mapping) => mapping.staticNodeId)).size).toBe(1);
    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(0);
  });
});
