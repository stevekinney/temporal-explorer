import {
  analyzeProject as analyzeLoadedProject,
  analyzeWorkflowFiles as analyzeLoadedWorkflowFiles,
  loadTemporalExplorerProject as loadAnalyzerProject,
  type AnalyzeWorkflowFilesOptions,
  type LoadTemporalExplorerProjectOptions,
  type TemporalExplorerProject,
} from '@temporal-explorer/analyzer';
import {
  importEventHistoryFile,
  parseEventHistory as parseLoadedEventHistory,
  type ImportEventHistoryFileOptions,
  type ParseEventHistoryOptions,
} from '@temporal-explorer/history';
import {
  createExecutionOverlay as createMappedExecutionOverlay,
  createOverlayReport,
  type CreateExecutionOverlayOptions,
} from '@temporal-explorer/mapper';
import {
  createDocumentationSet as createRenderedDocumentationSet,
  renderWorkflowMermaid as renderRenderedWorkflowMermaid,
  type CreateDocumentationSetOptions,
  type DocumentationFile,
} from '@temporal-explorer/renderers';
import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
  validateArtifact,
  type Diagnostic,
  type ExecutionOverlayDocument,
  type RuntimeTraceDocument,
  type TemporalAnalysisDocument,
} from '@temporal-explorer/schemas';

import { createTemporalExplorerResult, type TemporalExplorerResult } from './result';

export {
  createLiveClient,
  fetchEventHistory,
  listWorkflowRuns,
  type FetchEventHistoryOptions,
  type ListWorkflowRunsOptions,
  type LiveClient,
  type LiveConnectionOptions,
  type WorkflowRunSummary,
} from '@temporal-explorer/history';

export {
  createAggregateReport,
  createOverlayReport,
  formatAggregateReport,
  type AggregateReport,
  type CreateAggregateReportOptions,
} from '@temporal-explorer/mapper';

export {
  applySeverityOverrides,
  createSourceFileHashes,
  defineConfig,
  toProjectPath,
  type DiagnosticSeverityOverride,
  type TemporalConnectionProfile,
  type TemporalExplorerConfiguration,
} from '@temporal-explorer/analyzer';

export {
  renderMarkdown,
  renderTypeDeclarations,
  renderWorkflowJson,
  runDiagnostics,
  type DeclarationFile,
  type RenderMarkdownOptions,
  type RenderTypeDeclarationsOptions,
  type RenderWorkflowJsonOptions,
} from './library-parity';
export {
  createTemporalExplorerResult,
  getTemporalExplorerVersion,
  temporalExplorerArtifactVersions,
  type ArtifactReference,
  type TemporalExplorerResult,
} from './result';

function isTemporalExplorerProject(value: unknown): value is TemporalExplorerProject {
  const candidate =
    value && typeof value === 'object'
      ? (value as {
          root?: unknown;
          tsconfig?: unknown;
          outputDirectory?: unknown;
          workflowFiles?: unknown;
        })
      : {};

  return (
    typeof candidate.root === 'string' &&
    typeof candidate.tsconfig === 'string' &&
    typeof candidate.outputDirectory === 'string' &&
    Array.isArray(candidate.workflowFiles)
  );
}

function isWarningDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === 'warning';
}

function getWarningDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter(isWarningDiagnostic);
}

/** Resolves Temporal Explorer project defaults from a root directory or explicit files. */
export async function loadTemporalExplorerProject(
  options: LoadTemporalExplorerProjectOptions = {},
): Promise<TemporalExplorerProject> {
  return await loadAnalyzerProject(options);
}

/** Analyzes a loaded project and returns a structured library result. */
export async function analyzeProject(
  projectOrOptions: TemporalExplorerProject | LoadTemporalExplorerProjectOptions = {},
): Promise<TemporalExplorerResult<TemporalAnalysisDocument>> {
  const project = isTemporalExplorerProject(projectOrOptions)
    ? projectOrOptions
    : await loadTemporalExplorerProject(projectOrOptions);
  const analysis = await analyzeLoadedProject(project);

  return createTemporalExplorerResult(analysis, {
    diagnostics: analysis.diagnostics,
    warnings: getWarningDiagnostics(analysis.diagnostics),
    metadata: analysis.metadata,
  });
}

/** Analyzes explicit Workflow source files without relying on CLI project discovery. */
export async function analyzeWorkflowFiles(
  options: AnalyzeWorkflowFilesOptions,
): Promise<TemporalExplorerResult<TemporalAnalysisDocument>> {
  const analysis = await analyzeLoadedWorkflowFiles(options);

  return createTemporalExplorerResult(analysis, {
    diagnostics: analysis.diagnostics,
    warnings: getWarningDiagnostics(analysis.diagnostics),
    metadata: analysis.metadata,
  });
}

/** Parses an Event History object into a semantic runtime trace document. */
export function parseEventHistory(
  options: ParseEventHistoryOptions,
): TemporalExplorerResult<RuntimeTraceDocument> {
  const trace = parseLoadedEventHistory(options);

  return createTemporalExplorerResult(trace, {
    diagnostics: trace.diagnostics,
    warnings: getWarningDiagnostics(trace.diagnostics),
    metadata: trace.metadata,
  });
}

/** Imports an Event History JSON file into a semantic runtime trace document. */
export async function importHistoryFromFile(
  options: ImportEventHistoryFileOptions,
): Promise<TemporalExplorerResult<RuntimeTraceDocument>> {
  const trace = await importEventHistoryFile(options);

  return createTemporalExplorerResult(trace, {
    diagnostics: trace.diagnostics,
    warnings: getWarningDiagnostics(trace.diagnostics),
    metadata: trace.metadata,
  });
}

function parseArtifactOrThrow<T>(
  label: string,
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: { path: unknown[]; message: string }[] } },
): T {
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
  throw new Error(`${label} failed schema validation:\n${issues}`);
}

export type CreateExecutionOverlayFromArtifactsOptions = {
  analysisArtifact: unknown;
  traceArtifact: unknown;
  workflowName: string;
};

export type CreateDocumentationSetFromArtifactsOptions = {
  analysisArtifact: unknown;
  traceArtifacts?: unknown[];
  overlayArtifacts?: unknown[];
};

export type RenderWorkflowMermaidFromArtifactsOptions = {
  analysisArtifact: unknown;
  workflowName: string;
};

/** Creates a source-aware overlay from typed analysis and trace artifacts. */
export function createExecutionOverlay(
  options: CreateExecutionOverlayOptions,
): TemporalExplorerResult<ExecutionOverlayDocument> {
  const overlay = createMappedExecutionOverlay(options);

  return createTemporalExplorerResult(overlay, {
    diagnostics: overlay.diagnostics,
    warnings: getWarningDiagnostics(overlay.diagnostics),
    metadata: options.analysis.metadata,
  });
}

/** Validates artifact-shaped inputs, then creates a source-aware overlay. */
export function createExecutionOverlayFromArtifacts(
  options: CreateExecutionOverlayFromArtifactsOptions,
): TemporalExplorerResult<ExecutionOverlayDocument> {
  return createExecutionOverlay({
    analysis: parseArtifactOrThrow(
      'analysis artifact',
      temporalAnalysisDocumentSchema.safeParse(options.analysisArtifact),
    ),
    trace: parseArtifactOrThrow(
      'trace artifact',
      runtimeTraceDocumentSchema.safeParse(options.traceArtifact),
    ),
    workflowName: options.workflowName,
  });
}

/** Creates the Stage 4 text report from a validated overlay artifact. */
export function createOverlayReportFromArtifact(overlayArtifact: unknown): string {
  return createOverlayReport(
    parseArtifactOrThrow(
      'overlay artifact',
      executionOverlayDocumentSchema.safeParse(overlayArtifact),
    ),
  );
}

/** Creates deterministic documentation files from typed analysis and optional runtime artifacts. */
export function createDocumentationSet(
  options: CreateDocumentationSetOptions,
): TemporalExplorerResult<DocumentationFile[]> {
  const files = createRenderedDocumentationSet(options);

  return createTemporalExplorerResult(files, {
    metadata: options.analysis.metadata,
  });
}

/** Validates artifact-shaped inputs, then creates deterministic documentation files. */
export function createDocumentationSetFromArtifacts(
  options: CreateDocumentationSetFromArtifactsOptions,
): TemporalExplorerResult<DocumentationFile[]> {
  return createDocumentationSet({
    analysis: parseArtifactOrThrow(
      'analysis artifact',
      temporalAnalysisDocumentSchema.safeParse(options.analysisArtifact),
    ),
    traces: (options.traceArtifacts ?? []).map((artifact, index) =>
      parseArtifactOrThrow(
        `trace artifact ${index + 1}`,
        runtimeTraceDocumentSchema.safeParse(artifact),
      ),
    ),
    overlays: (options.overlayArtifacts ?? []).map((artifact, index) =>
      parseArtifactOrThrow(
        `overlay artifact ${index + 1}`,
        executionOverlayDocumentSchema.safeParse(artifact),
      ),
    ),
  });
}

/** Validates an analysis artifact, then renders one Workflow as Mermaid. */
export function renderWorkflowMermaidFromArtifacts(
  options: RenderWorkflowMermaidFromArtifactsOptions,
): string {
  return renderRenderedWorkflowMermaid(
    parseArtifactOrThrow(
      'analysis artifact',
      temporalAnalysisDocumentSchema.safeParse(options.analysisArtifact),
    ),
    options.workflowName,
  );
}

export { validateArtifact };
export type {
  AnalyzeWorkflowFilesOptions,
  CreateDocumentationSetOptions,
  CreateExecutionOverlayOptions,
  DocumentationFile,
  ExecutionOverlayDocument,
  ImportEventHistoryFileOptions,
  LoadTemporalExplorerProjectOptions,
  ParseEventHistoryOptions,
  RuntimeTraceDocument,
  TemporalAnalysisDocument,
  TemporalExplorerProject,
};
