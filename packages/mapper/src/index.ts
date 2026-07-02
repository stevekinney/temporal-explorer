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

export type CreateExecutionOverlayOptions = {
  analysis: TemporalAnalysisDocument;
  trace: RuntimeTraceDocument;
  workflowName: string;
};

function getWorkflow(analysis: TemporalAnalysisDocument, workflowName: string): WorkflowDefinition {
  const workflow = analysis.workflows.find((candidate) => candidate.name === workflowName);

  if (!workflow) {
    throw new Error(`Workflow "${workflowName}" was not found in static analysis.`);
  }

  return workflow;
}

/** Joins one static analysis document and one runtime trace into a source-aware overlay. */
export function createExecutionOverlay(
  options: CreateExecutionOverlayOptions,
): ExecutionOverlayDocument {
  const workflow = getWorkflow(options.analysis, options.workflowName);
  const mappings = createMappings(workflow, options.trace);
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

export type { ExecutionOverlayDocument, MappingEvidence, RuntimeNodeMapping, StaticOverlayNode };
