import { describe, expect, it } from 'bun:test';

import {
  type FlowNode,
  type RuntimeOperation,
  type RuntimeTraceDocument,
  type SourceLocation,
  type TemporalAnalysisDocument,
  type TemporalCommand,
  type WorkflowDefinition,
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
} from '@temporal-explorer/schemas';

import { createExecutionOverlay } from './index';

const source: SourceLocation = {
  path: 'src/workflows.ts',
  pathKind: 'project-relative',
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

function command(
  id: string,
  kind: TemporalCommand['kind'],
  name: string,
  staticOrder: number,
  cardinality?: TemporalCommand['cardinality'],
): TemporalCommand {
  return {
    id,
    kind,
    name,
    source,
    confidence: 'exact',
    staticOrder,
    ...(cardinality ? { cardinality } : {}),
  };
}

function workflow(commands: TemporalCommand[], nodes: FlowNode[]): WorkflowDefinition {
  return {
    id: 'workflow:w',
    name: 'w',
    source,
    exported: true,
    signature: {
      args: [],
      result: { id: 'void', display: 'void', kind: 'primitive', confidence: 'exact' },
    },
    messageSurface: { signals: [], queries: [], updates: [] },
    state: { variables: [] },
    body: { nodes },
    temporalCommands: commands,
    dependencies: [],
    diagnostics: [],
  };
}

function analysisDocument(workflowDefinition: WorkflowDefinition): TemporalAnalysisDocument {
  return {
    schemaVersion: 'temporal-analysis/v1',
    artifactId: 'analysis:test',
    metadata,
    project: { root: '/tmp/test', tsconfig: 'tsconfig.json', packageManager: 'bun' },
    sdk: { detectedPackages: [] },
    workers: [],
    workflows: [workflowDefinition],
    activities: [],
    clients: [],
    diagnostics: [],
  };
}

function traceDocument(operations: RuntimeOperation[]): RuntimeTraceDocument {
  return {
    schemaVersion: 'temporal-trace/v1',
    artifactId: 'trace:test',
    metadata,
    execution: {
      workflowType: 'w',
      workflowId: 'workflow-id',
      runId: 'run-id',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00.000Z',
      closedAt: '2026-01-01T00:00:01.000Z',
    },
    source: { eventCount: operations.length, importedFrom: 'file' },
    operations,
    timeline: [],
    payloads: [],
    diagnostics: [],
  };
}

function activityOperation(id: string, eventId: number, activityType: string): RuntimeOperation {
  return {
    id,
    kind: 'activity',
    activityType,
    activityId: id,
    status: 'completed',
    attempts: [{ attempt: 1, scheduledEventId: eventId, status: 'completed' }],
    firstScheduledAt: '2026-01-01T00:00:00.000Z',
    eventReferences: [{ eventId, eventType: 'ActivityTaskScheduled' }],
    payloadReferences: [],
  };
}

function timerOperation(id: string, eventId: number): RuntimeOperation {
  return {
    id,
    kind: 'timer',
    timerId: id,
    status: 'fired',
    startedAt: '2026-01-01T00:00:00.000Z',
    eventReferences: [{ eventId, eventType: 'TimerStarted' }],
  };
}

function childOperation(id: string, eventId: number, workflowType: string): RuntimeOperation {
  return {
    id,
    kind: 'child-workflow',
    workflowType,
    childWorkflowId: id,
    status: 'completed',
    initiatedAt: '2026-01-01T00:00:00.000Z',
    eventReferences: [{ eventId, eventType: 'StartChildWorkflowExecutionInitiated' }],
    payloadReferences: [],
  };
}

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

  it('preserves a later same-name Activity after a repeated template', () => {
    const fanOut = command('activity:fanout', 'activity', 'foo', 0, 'fan-out');
    const later = command('activity:later', 'activity', 'foo', 1);
    const overlay = createExecutionOverlay({
      analysis: analysisDocument(
        workflow(
          [fanOut, later],
          [
            {
              type: 'parallel',
              id: 'parallel',
              parallelKind: 'all',
              cardinality: 'dynamic',
              templateBranch: [{ type: 'command', id: 'fanout-node', commandId: fanOut.id }],
            },
            { type: 'command', id: 'later-node', commandId: later.id },
          ],
        ),
      ),
      trace: traceDocument([
        activityOperation('activity:foo:1', 1, 'foo'),
        activityOperation('activity:foo:2', 2, 'foo'),
        activityOperation('activity:foo:3', 3, 'foo'),
        activityOperation('activity:foo:4', 4, 'foo'),
      ]),
      workflowName: 'w',
    });

    expect(overlay.mappings.map((mapping) => mapping.staticNodeId)).toEqual([
      fanOut.id,
      fanOut.id,
      fanOut.id,
      later.id,
    ]);
    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(0);
  });

  it('maps repeated loop timers back to the loop body timer command', () => {
    const timer = command('timer:loop', 'timer', 'sleep', 0);
    const overlay = createExecutionOverlay({
      analysis: analysisDocument(
        workflow(
          [timer],
          [
            {
              type: 'loop',
              id: 'loop',
              loopKind: 'while',
              body: [{ type: 'command', id: 'timer-node', commandId: timer.id }],
            },
          ],
        ),
      ),
      trace: traceDocument([timerOperation('timer:1', 1), timerOperation('timer:2', 2)]),
      workflowName: 'w',
    });

    expect(overlay.mappings.map((mapping) => mapping.staticNodeId)).toEqual([timer.id, timer.id]);
    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(0);
  });

  it('maps repeated loop child Workflows back to the loop body child command', () => {
    const child = command('child:loop', 'child-workflow', 'ChildWorkflow', 0);
    const overlay = createExecutionOverlay({
      analysis: analysisDocument(
        workflow(
          [child],
          [
            {
              type: 'loop',
              id: 'loop',
              loopKind: 'while',
              body: [{ type: 'command', id: 'child-node', commandId: child.id }],
            },
          ],
        ),
      ),
      trace: traceDocument([
        childOperation('child:1', 1, 'ChildWorkflow'),
        childOperation('child:2', 2, 'ChildWorkflow'),
      ]),
      workflowName: 'w',
    });

    expect(overlay.mappings.map((mapping) => mapping.staticNodeId)).toEqual([child.id, child.id]);
    expect(overlay.coverage.nodes.unmappedRuntimeOperations).toBe(0);
  });
});
