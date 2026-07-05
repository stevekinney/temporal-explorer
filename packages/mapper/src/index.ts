import type {
  ExecutionOverlayDocument,
  MappingEvidence,
  RuntimeNodeMapping,
  RuntimeTraceDocument,
  StaticOverlayNode,
  TemporalAnalysisDocument,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { createCoverage, createDiagnostics, createStaticNodes } from './coverage';
import { createMappings } from './mappings';

/** One command observed during optional replay, in scheduling order. */
export type ReplayCapturedCommand = {
  kind: 'activity' | 'timer';
  name: string;
  sequence: number;
};

export type CreateExecutionOverlayOptions = {
  analysis: TemporalAnalysisDocument;
  trace: RuntimeTraceDocument;
  workflowName: string;
  /** Optional replay-derived evidence; upgrades dynamic mappings. */
  replayCapture?: ReplayCapturedCommand[] | undefined;
};

function getWorkflow(analysis: TemporalAnalysisDocument, workflowName: string): WorkflowDefinition {
  // Match the runtime workflow type (the registered display name). Several
  // implementations can register under one name (worker versioning); a trace
  // cannot say which one ran, so bind explicitly by erroring rather than
  // silently attaching the overlay to an arbitrary implementation.
  const matches = analysis.workflows.filter(
    (candidate) => candidate.name === workflowName || candidate.implementationName === workflowName,
  );

  if (matches.length > 1) {
    const names = matches
      .map((candidate) => candidate.implementationName ?? candidate.name)
      .join(', ');
    throw new Error(
      `Workflow "${workflowName}" is ambiguous across implementations (${names}); overlay one at a time.`,
    );
  }

  const workflow = matches[0];

  if (!workflow) {
    throw new Error(`Workflow "${workflowName}" was not found in static analysis.`);
  }

  return workflow;
}

/**
 * Applies replay-derived command evidence: runtime Activity operations are
 * aligned with the replay capture by scheduling order, and mappings that were
 * only attributable to a dynamic dispatch site gain resolved-name evidence
 * with upgraded confidence when the replayed Activity type matches.
 */
function applyReplayEvidence(
  mappings: RuntimeNodeMapping[],
  trace: RuntimeTraceDocument,
  replayCapture: ReplayCapturedCommand[],
): void {
  const capturedActivities = replayCapture
    .filter((command) => command.kind === 'activity')
    .toSorted((left, right) => left.sequence - right.sequence);
  const activityOperations = trace.operations
    .filter((operation) => operation.kind === 'activity')
    .toSorted(
      (left, right) =>
        (left.eventReferences[0]?.eventId ?? 0) - (right.eventReferences[0]?.eventId ?? 0),
    );

  activityOperations.forEach((operation, index) => {
    const captured = capturedActivities[index];

    if (!captured || operation.kind !== 'activity' || captured.name !== operation.activityType) {
      return;
    }

    const mapping = mappings.find((entry) => entry.runtimeOperationId === operation.id);

    if (mapping?.confidence === 'dynamic') {
      mapping.confidence = 'inferred';
      mapping.reason = `${mapping.reason} Replay confirmed ${captured.name} at command sequence ${captured.sequence}.`;
      mapping.evidence.push({
        kind: 'replay-command-sequence',
        description: `Replay observed Activity ${captured.name} scheduled at command sequence ${captured.sequence}.`,
        staticNodeId: mapping.staticNodeId ?? undefined,
      });
    }
  });
}

/** Joins one static analysis document and one runtime trace into a source-aware overlay. */
export function createExecutionOverlay(
  options: CreateExecutionOverlayOptions,
): ExecutionOverlayDocument {
  const workflow = getWorkflow(options.analysis, options.workflowName);
  const mappings = createMappings(workflow, options.trace);

  if (options.replayCapture) {
    applyReplayEvidence(mappings, options.trace, options.replayCapture);
  }

  const staticNodes = createStaticNodes(workflow, mappings);

  return {
    schemaVersion: 'temporal-overlay/v1',
    artifactId: `overlay:${options.workflowName}:${options.trace.artifactId}`,
    staticAnalysisId: options.analysis.artifactId,
    runtimeTraceId: options.trace.artifactId,
    workflow: options.workflowName,
    staticNodes,
    mappings,
    branchOutcomes: [],
    coverage: createCoverage(workflow, staticNodes, mappings, options.trace),
    diagnostics: createDiagnostics(mappings),
  };
}

function formatSource(node: StaticOverlayNode): string {
  return node.source ? `${node.source.path}:${node.source.start.line}` : 'unknown source';
}

function getMappingForNode(
  overlay: ExecutionOverlayDocument,
  node: StaticOverlayNode,
): RuntimeNodeMapping | undefined {
  return overlay.mappings.find((mapping) => mapping.staticNodeId === node.id);
}

function appendNodeSection(
  lines: string[],
  overlay: ExecutionOverlayDocument,
  kind: StaticOverlayNode['kind'],
  heading: string,
): void {
  const nodes = overlay.staticNodes.filter((candidate) => candidate.kind === kind);

  if (nodes.length === 0) {
    return;
  }

  lines.push('', heading);

  for (const node of nodes) {
    const mapping = getMappingForNode(overlay, node);
    const state = node.observed ? 'observed' : 'not observed';
    const confidence = mapping?.confidence ?? 'unknown';
    lines.push(`  ${node.name} (${state}) -> ${formatSource(node)} [${confidence}]`);

    if (mapping) {
      lines.push(`    ${mapping.reason}`);
    }
  }
}

/** Renders the human-readable source-aware trace report for one overlay. */
export function createOverlayReport(overlay: ExecutionOverlayDocument): string {
  const lines = [
    `Trace Report: ${overlay.workflow}`,
    '',
    `Mapped runtime operations: ${overlay.mappings.length - overlay.coverage.nodes.unmappedRuntimeOperations}/${overlay.mappings.length}`,
    `Unmapped runtime operations: ${overlay.coverage.nodes.unmappedRuntimeOperations}`,
    '',
    'Executed Activities',
  ];

  for (const node of overlay.staticNodes.filter((candidate) => candidate.kind === 'activity')) {
    const mapping = getMappingForNode(overlay, node);
    const state = node.observed ? 'observed' : 'not observed';
    const confidence = mapping?.confidence ?? 'unknown';
    lines.push(`  ${node.name} (${state}) -> ${formatSource(node)} [${confidence}]`);

    if (mapping) {
      lines.push(`    ${mapping.reason}`);
    }
  }

  appendNodeSection(lines, overlay, 'signal', 'Signals');
  appendNodeSection(lines, overlay, 'timer', 'Timers');
  appendNodeSection(lines, overlay, 'condition', 'Conditions');

  return `${lines.join('\n')}\n`;
}

export {
  createAggregateReport,
  formatAggregateReport,
  type AggregateActivityStats,
  type AggregateNodeCoverage,
  type AggregateReport,
  type CreateAggregateReportOptions,
} from './aggregate';
export type { ExecutionOverlayDocument, MappingEvidence, RuntimeNodeMapping, StaticOverlayNode };
