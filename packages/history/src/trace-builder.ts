import type { PayloadReference, RuntimeTraceDocument } from '@temporal-explorer/schemas';

import { createActivityOperations } from './activity-operations';
import { createUnknownEventDiagnostics } from './diagnostics';
import { parseEventHistoryEvents, readRecordField, readStringField } from './history-json';
import type { PayloadPreviewConfiguration } from './payloads';
import { createTimeline } from './timeline';
import {
  createWorkflowExecution,
  createWorkflowLifecycle,
  type WorkflowLifecycle,
} from './workflow-lifecycle';

export type HistoryProvenance = {
  workflowId?: string;
  workflowType?: string;
  temporalSdkVersion?: string;
};

export type ParseEventHistoryOptions = {
  history: unknown;
  projectRoot?: string;
  historyHash?: string;
  historyPath?: string;
  traceId?: string;
  importedFrom?: 'file' | 'api' | 'cli';
  provenance?: HistoryProvenance;
  payloadPreview?: PayloadPreviewConfiguration;
};

function createMetadata(options: ParseEventHistoryOptions): RuntimeTraceDocument['metadata'] {
  return {
    temporalExplorerVersion: '0.0.0-mvp',
    schemaVersion: 'temporal-trace/v1',
    inputs: {
      projectRoot: options.projectRoot ?? '',
      configHash: options.historyHash ?? '',
      sourceFileHashes: {},
      temporalSdkVersions: options.provenance?.temporalSdkVersion
        ? { '@temporalio/workflow': options.provenance.temporalSdkVersion }
        : {},
    },
  };
}

function createSource(
  lifecycle: WorkflowLifecycle,
  eventCount: number,
  importedFrom: ParseEventHistoryOptions['importedFrom'],
): RuntimeTraceDocument['source'] {
  const taskQueue = readStringField(
    readRecordField(lifecycle.workflowStartedAttributes ?? {}, 'taskQueue'),
    'name',
  );

  return {
    ...(taskQueue ? { taskQueue } : {}),
    eventCount,
    importedFrom: importedFrom ?? 'file',
  };
}

export function parseEventHistory(options: ParseEventHistoryOptions): RuntimeTraceDocument {
  const events = parseEventHistoryEvents(options.history);
  const payloads: PayloadReference[] = [];
  const configuration = options.payloadPreview ?? {};
  const lifecycle = createWorkflowLifecycle(events, payloads, configuration, options.provenance);
  const activityOperations = createActivityOperations(events, payloads, configuration);

  return {
    schemaVersion: 'temporal-trace/v1',
    artifactId: `trace:${options.traceId ?? lifecycle.workflowType}:${lifecycle.runId}`,
    metadata: createMetadata(options),
    execution: createWorkflowExecution(lifecycle),
    source: createSource(lifecycle, events.length, options.importedFrom),
    operations: [...lifecycle.operations, ...activityOperations],
    timeline: createTimeline(
      lifecycle.workflowStartedEvent,
      lifecycle.workflowClosedEvent,
      activityOperations,
    ),
    payloads,
    diagnostics: createUnknownEventDiagnostics(events),
  };
}
