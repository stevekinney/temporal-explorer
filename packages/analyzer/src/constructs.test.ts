import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  analyzeProject,
  applySeverityOverrides,
  defineConfig,
  loadTemporalExplorerProject,
} from './index';

describe('construct discovery and configuration', () => {
  it('discovers queries, updates, validators, and query diagnostics', async () => {
    const queryRoot = new URL('../../../fixtures/query', import.meta.url).pathname;
    const queryAnalysis = await analyzeProject(
      await loadTemporalExplorerProject({
        root: queryRoot,
        workflowFiles: ['src/workflows/query-workflow.ts'],
      }),
    );
    const queryWorkflow = queryAnalysis.workflows[0];
    const statusQuery = queryWorkflow?.messageSurface.queries.find(
      (query) => query.name === 'status',
    );

    if (!queryWorkflow || !statusQuery) {
      throw new Error('Expected the query workflow and status query to be discovered.');
    }

    expect(queryWorkflow.messageSurface.queries.map((query) => query.name)).toEqual([
      'auditCount',
      'bump',
      'status',
    ]);
    expect(statusQuery.result?.display).toBe('OrderStatus');
    expect(queryAnalysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'TEA_QUERY_STATE_MUTATION',
    ]);
    expect(queryAnalysis.diagnostics[0]?.severity).toBe('error');
  });

  it('discovers updates and validators', async () => {
    const updateRoot = new URL('../../../fixtures/update', import.meta.url).pathname;
    const updateAnalysis = await analyzeProject(
      await loadTemporalExplorerProject({
        root: updateRoot,
        workflowFiles: ['src/workflows/update-workflow.ts'],
      }),
    );
    const updateWorkflow = updateAnalysis.workflows[0];
    const setAddress = updateWorkflow?.messageSurface.updates.find(
      (update) => update.name === 'setAddress',
    );

    if (!updateWorkflow || !setAddress) {
      throw new Error('Expected the update workflow and setAddress update to be discovered.');
    }

    expect(updateWorkflow.messageSurface.updates.map((update) => update.name)).toEqual([
      'explode',
      'setAddress',
    ]);
    expect(setAddress.result?.display).toBe('ShippingAddress');
    expect(setAddress.validatorSource?.path).toBe('src/workflows/update-workflow.ts');
  });

  const readCommands = async (fixture: string, file: string) => {
    const root = new URL(`../../../fixtures/${fixture}`, import.meta.url).pathname;
    const analysis = await analyzeProject(
      await loadTemporalExplorerProject({ root, workflowFiles: [file] }),
    );
    return analysis.workflows.flatMap((workflow) =>
      workflow.temporalCommands.map((command) => [command.kind, command.name]),
    );
  };

  it('discovers child workflow and external signal commands', async () => {
    expect(await readCommands('child-workflow', 'src/workflows/child-workflow-parent.ts')).toEqual([
      ['child-workflow', 'reserveInventoryChild'],
      ['child-workflow', 'releaseNotificationChild'],
    ]);

    const externalCommands = await readCommands(
      'external',
      'src/workflows/external-interaction-workflow.ts',
    );
    expect(externalCommands).toContainEqual(['external-workflow', 'release']);
  });

  // Each `readCommands` call spins up a cold ts-morph Project with full type
  // resolution (~1.8s). These construct-discovery assertions are kept in
  // separate tests — one Project load apiece — so no single test batches
  // multiple loads past bun's 5000ms default timeout.
  it('discovers patch commands', async () => {
    expect(await readCommands('patched', 'src/workflows/patched-workflow.ts')).toEqual([
      ['patch', 'legacy-tax-rounding'],
      ['patch', 'use-modern-charge'],
      ['activity', 'newCharge'],
      ['activity', 'oldCharge'],
    ]);
  });

  it('discovers continue-as-new commands', async () => {
    expect(
      await readCommands('continue-as-new', 'src/workflows/continue-as-new-workflow.ts'),
    ).toEqual([
      ['activity', 'recordIteration'],
      ['continue-as-new', 'continueAsNewWorkflow'],
    ]);
  });

  it('discovers cancellation scopes', async () => {
    const cancellationCommands = await readCommands(
      'cancellation',
      'src/workflows/cancellation-workflow.ts',
    );
    expect(cancellationCommands).toContainEqual(['cancellation-scope', 'cancellable']);
    expect(cancellationCommands).toContainEqual(['cancellation-scope', 'nonCancellable']);
  });

  it('marks deprecatePatch commands as deprecated and patched commands as not', async () => {
    const root = new URL('../../../fixtures/patched', import.meta.url).pathname;
    const analysis = await analyzeProject(
      await loadTemporalExplorerProject({
        root,
        workflowFiles: ['src/workflows/patched-workflow.ts'],
      }),
    );
    const patches = analysis.workflows
      .flatMap((workflow) => workflow.temporalCommands)
      .filter((command) => command.kind === 'patch');

    expect(patches.map((command) => [command.name, command.deprecated ?? false])).toEqual([
      ['legacy-tax-rounding', true],
      ['use-modern-charge', false],
    ]);
  });

  it('validates configuration shapes and applies severity overrides', async () => {
    expect(() => defineConfig({ include: ['src/**/*.ts'] })).not.toThrow();
    expect(() => defineConfig({ include: 'src' as unknown as string[] })).toThrow(
      'include must be an array of strings',
    );
    expect(() =>
      defineConfig({ diagnostics: { TEA_DYNAMIC_ACTIVITY_CALL: 'loud' as 'error' } }),
    ).toThrow('must be error, warning, info, or off');

    const diagnostics = [
      {
        code: 'TEA_DYNAMIC_ACTIVITY_CALL',
        category: 'control-flow' as const,
        severity: 'warning' as const,
        message: 'dynamic',
        confidence: 'dynamic' as const,
      },
      {
        code: 'TEA_QUERY_STATE_MUTATION',
        category: 'determinism' as const,
        severity: 'error' as const,
        message: 'mutation',
        confidence: 'exact' as const,
      },
    ];

    expect(
      applySeverityOverrides(diagnostics, {
        TEA_DYNAMIC_ACTIVITY_CALL: 'error',
        TEA_QUERY_STATE_MUTATION: 'off',
      }).map((diagnostic) => [diagnostic.code, diagnostic.severity]),
    ).toEqual([['TEA_DYNAMIC_ACTIVITY_CALL', 'error']]);
    expect(applySeverityOverrides(diagnostics, undefined)).toBe(diagnostics);
  });

  it('loads temporal-explorer.config.ts and applies its globs and output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-config-'));
    await mkdir(join(root, 'flows'), { recursive: true });
    await Bun.write(join(root, 'tsconfig.json'), JSON.stringify({ include: ['flows/**/*.ts'] }));
    await Bun.write(
      join(root, 'flows', 'configured.workflow.ts'),
      'export async function configuredWorkflow(): Promise<void> {}\n',
    );
    await Bun.write(
      join(root, 'temporal-explorer.config.ts'),
      `
const configuration = {
  temporal: { workflowGlobs: ['flows/**/*.workflow.ts'] },
  output: { directory: 'artifacts' },
  diagnostics: { TEA_DYNAMIC_ACTIVITY_CALL: 'error' },
};

export default configuration;
`,
    );

    const project = await loadTemporalExplorerProject({ root });

    expect(project.workflowFiles).toEqual([join(root, 'flows', 'configured.workflow.ts')]);
    expect(project.outputDirectory).toBe(join(root, 'artifacts'));
    expect(project.configuration?.diagnostics).toEqual({ TEA_DYNAMIC_ACTIVITY_CALL: 'error' });
  });
});
