import { describe, expect, it } from 'bun:test';

import {
  analyzeProject,
  analyzeWorkflowFiles,
  createDocumentationSetFromArtifacts,
  createExecutionOverlayFromArtifacts,
  createOverlayReportFromArtifact,
  createTemporalExplorerResult,
  getTemporalExplorerVersion,
  importHistoryFromFile,
  loadTemporalExplorerProject,
  parseEventHistory,
  temporalExplorerArtifactVersions,
} from './index';

const fixtureRoot = new URL('../../../fixtures/basic-order', import.meta.url).pathname;
const analysisArtifactFile = Bun.file(`${fixtureRoot}/.temporal-explorer/analysis.json`);
const traceArtifactFile = Bun.file(
  `${fixtureRoot}/.temporal-explorer/histories/success.trace.json`,
);
const overlayArtifactFile = Bun.file(
  `${fixtureRoot}/.temporal-explorer/overlays/success.overlay.json`,
);

describe('public API scaffold', () => {
  it('exposes the product version and artifact versions', () => {
    expect(getTemporalExplorerVersion()).toBe('0.0.0-mvp');
    expect(temporalExplorerArtifactVersions.analysis).toBe('temporal-analysis/v1');
  });

  it('creates structured library results without printing or exiting', () => {
    const result = createTemporalExplorerResult({ message: 'ready' });

    expect(result.value).toEqual({ message: 'ready' });
    expect(result.diagnostics).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.artifacts).toEqual([]);
  });

  it('analyzes the basic order fixture through the public API', async () => {
    const project = await loadTemporalExplorerProject({ root: fixtureRoot });
    const result = await analyzeProject(project);

    expect(result.value.workflows.map((workflow) => workflow.name)).toEqual(['basicOrderWorkflow']);
    expect(result.value.workflows[0]?.temporalCommands.map((command) => command.name)).toEqual([
      'validateOrder',
      'chargeCard',
      'shipOrder',
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('analyzes project options through the public API', async () => {
    const optionsResult = await analyzeProject({
      root: fixtureRoot,
      workflowFiles: ['src/workflows/basic-order-workflow.ts'],
    });

    expect(optionsResult.value.workflows[0]?.name).toBe('basicOrderWorkflow');
  });

  it('analyzes explicit workflow files through the public API', async () => {
    const explicitFilesResult = await analyzeWorkflowFiles({
      projectRoot: fixtureRoot,
      tsconfig: 'tsconfig.json',
      workflowFiles: ['src/workflows/basic-order-workflow.ts'],
      outputDirectory: '.temporal-explorer',
    });

    expect(explicitFilesResult.value.workflows[0]?.name).toBe('basicOrderWorkflow');
    expect(explicitFilesResult.warnings).toEqual([]);
  });

  it('imports the basic order history through the public API', async () => {
    const result = await importHistoryFromFile({
      projectRoot: fixtureRoot,
      file: `${fixtureRoot}/histories/success.json`,
    });

    expect(result.value.schemaVersion).toBe('temporal-trace/v1');
    expect(result.value.execution.workflowType).toBe('basicOrderWorkflow');
    expect(result.value.execution.status).toBe('completed');
    expect(
      result.value.operations.filter((operation) => operation.kind === 'activity'),
    ).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('parses Event History objects through the public API', () => {
    const result = parseEventHistory({
      history: {
        events: [
          {
            eventId: 1,
            eventTime: '2026-01-01T00:00:00.001Z',
            eventType: 1,
            workflowExecutionStartedEventAttributes: {
              workflowType: { name: 'apiWorkflow' },
              originalExecutionRunId: 'api-run-id',
            },
          },
          {
            eventId: 2,
            eventTime: '2026-01-01T00:00:00.002Z',
            eventType: 999,
          },
        ],
      },
      importedFrom: 'api',
    });

    expect(result.value.execution.workflowType).toBe('apiWorkflow');
    expect(result.value.execution.status).toBe('running');
    expect(result.warnings[0]?.code).toBe('TEH_UNKNOWN_EVENT_TYPE');
  });

  it('creates an execution overlay and report through the public API', async () => {
    const result = createExecutionOverlayFromArtifacts({
      analysisArtifact: await analysisArtifactFile.json(),
      traceArtifact: await traceArtifactFile.json(),
      workflowName: 'basicOrderWorkflow',
    });
    const report = createOverlayReportFromArtifact(result.value);

    expect(result.value.schemaVersion).toBe('temporal-overlay/v1');
    expect(result.value.coverage.nodes.unmappedRuntimeOperations).toBe(0);
    expect(report).toContain('validateOrder (observed)');
  });

  it('throws readable errors for malformed artifact inputs', async () => {
    const traceArtifact = await traceArtifactFile.json();

    expect(() =>
      createExecutionOverlayFromArtifacts({
        analysisArtifact: { schemaVersion: 'temporal-analysis/v1' },
        traceArtifact,
        workflowName: 'basicOrderWorkflow',
      }),
    ).toThrow('analysis artifact failed schema validation:');
  });

  it('creates deterministic documentation through the public API', async () => {
    const result = createDocumentationSetFromArtifacts({
      analysisArtifact: await analysisArtifactFile.json(),
      traceArtifacts: [await traceArtifactFile.json()],
      overlayArtifacts: [await overlayArtifactFile.json()],
    });

    expect(result.value.map((documentationFile) => documentationFile.path)).toEqual([
      'basicOrderWorkflow.md',
      'basicOrderWorkflow.mmd',
      'index.md',
    ]);
    expect(result.value[0]?.contents).toContain('Payload previews: redacted by default');
  });
});
