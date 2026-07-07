import { describe, expect, it } from 'bun:test';

import type {
  ExecutionOverlayDocument,
  ExplorerArtifacts,
  RuntimeTraceDocument,
  TemporalAnalysisDocument,
} from '@temporal-explorer/schemas';

import { defaultWorkflowId, overlaysForWorkflow, traceMatchesRequest } from './artifact-selection';

const source = {
  path: 'src/workflows.ts',
  pathKind: 'project-relative' as const,
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

const metadata = {
  temporalExplorerVersion: 'test',
  schemaVersion: 'test',
  generatedAt: '2026-01-01T00:00:00.000Z',
  inputs: {
    projectRoot: '/tmp/test',
    configHash: 'test',
    sourceFileHashes: {},
    temporalSdkVersions: {},
  },
};

function workflow(id: string, name: string, implementationName: string) {
  return {
    id,
    name,
    implementationName,
    source,
    exported: true,
    signature: {
      args: [],
      result: {
        id: 'void',
        display: 'void',
        kind: 'primitive' as const,
        confidence: 'exact' as const,
      },
    },
    messageSurface: { signals: [], queries: [], updates: [] },
    state: { variables: [] },
    body: { nodes: [] },
    temporalCommands: [],
    dependencies: [],
    diagnostics: [],
  };
}

function trace(artifactId: string, workflowId: string): RuntimeTraceDocument {
  return {
    schemaVersion: 'temporal-trace/v1',
    artifactId,
    metadata,
    execution: {
      workflowType: 'AutoUpgrading',
      workflowId,
      runId: `${workflowId}-run`,
      status: 'completed',
      startedAt: '2026-01-01T00:00:00.000Z',
      closedAt: '2026-01-01T00:00:01.000Z',
    },
    source: { eventCount: 1, importedFrom: 'file' },
    operations: [],
    timeline: [],
    payloads: [],
    diagnostics: [],
  };
}

function overlay(
  artifactId: string,
  runtimeTraceId: string,
  workflowId: string,
): ExecutionOverlayDocument {
  return {
    schemaVersion: 'temporal-overlay/v1',
    artifactId,
    staticAnalysisId: 'analysis:test',
    runtimeTraceId,
    workflow: 'AutoUpgrading',
    staticNodes: [
      { id: workflowId, kind: 'workflow', name: 'AutoUpgrading', observed: true, source },
    ],
    mappings: [],
    branchOutcomes: [],
    coverage: {
      nodes: { total: 1, observed: 1, skipped: 0, unmappedRuntimeOperations: 0 },
      activities: { staticTotal: 0, observed: 0, retried: 0, failed: 0 },
      messages: {
        staticSignals: 0,
        receivedSignals: [],
        staticUpdates: 0,
        receivedUpdates: [],
        staticQueries: 0,
      },
      timers: { staticTotal: 0, fired: 0, canceled: 0, pending: 0 },
    },
    diagnostics: [],
  };
}

function artifacts(): ExplorerArtifacts {
  const firstWorkflow = workflow('workflow:autoV1', 'AutoUpgrading', 'autoV1');
  const secondWorkflow = workflow('workflow:autoV2', 'AutoUpgrading', 'autoV2');
  const firstTrace = trace('trace:v1:v1-run', 'v1');
  const secondTrace = trace('trace:v2:v2-run', 'v2');
  const analysis: TemporalAnalysisDocument = {
    schemaVersion: 'temporal-analysis/v1',
    artifactId: 'analysis:test',
    metadata,
    project: { root: '/tmp/test', tsconfig: 'tsconfig.json', packageManager: 'bun' },
    sdk: { detectedPackages: [] },
    workers: [],
    workflows: [firstWorkflow, secondWorkflow],
    activities: [],
    clients: [],
    diagnostics: [],
  };

  return {
    projectName: 'test',
    artifactDirectory: '.temporal-explorer',
    analysis,
    traces: [firstTrace, secondTrace],
    overlays: [
      overlay('overlay:v1', firstTrace.artifactId, firstWorkflow.id),
      overlay('overlay:v2', secondTrace.artifactId, secondWorkflow.id),
    ],
  };
}

describe('artifact selection', () => {
  it('matches requested traces by artifact slug, workflow id, or run id', () => {
    const firstTrace = artifacts().traces[0];

    if (!firstTrace) {
      throw new Error('Expected the fixture to include a trace.');
    }

    expect(traceMatchesRequest(firstTrace, 'v1')).toBe(true);
    expect(traceMatchesRequest(firstTrace, 'v1-run')).toBe(true);
    expect(traceMatchesRequest(firstTrace, 'missing')).toBe(false);
  });

  it('uses the overlay runtime trace identity to choose between workflows sharing a registered name', () => {
    const fixture = artifacts();

    expect(defaultWorkflowId(fixture, 'v2')).toBe('workflow:autoV2');
  });

  it('filters overlays by unique workflow node id instead of registered name alone', () => {
    const fixture = artifacts();
    const [, secondWorkflow] = fixture.analysis.workflows;

    expect(
      overlaysForWorkflow(fixture, secondWorkflow).map((candidate) => candidate.artifactId),
    ).toEqual(['overlay:v2']);
  });
});
