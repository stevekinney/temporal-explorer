import {
  analyzeProject as analyzeLoadedProject,
  applySeverityOverrides,
  loadTemporalExplorerProject,
  type LoadTemporalExplorerProjectOptions,
  type TemporalExplorerProject,
} from '@temporal-explorer/analyzer';
import {
  renderWorkflowIndexMarkdown,
  renderWorkflowMarkdown,
  type CreateDocumentationSetOptions,
} from '@temporal-explorer/renderers';
import type {
  Diagnostic,
  TemporalAnalysisDocument,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import { createTemporalExplorerResult, type TemporalExplorerResult } from './result';

export type RenderMarkdownOptions = CreateDocumentationSetOptions & {
  /** Renders one Workflow page; omit for the Workflow index page. */
  workflowName?: string;
};

/** Renders deterministic Markdown for one Workflow or the Workflow index. */
export function renderMarkdown(options: RenderMarkdownOptions): TemporalExplorerResult<string> {
  const contents = options.workflowName
    ? renderWorkflowMarkdown({ ...options, workflowName: options.workflowName })
    : renderWorkflowIndexMarkdown(options);

  return createTemporalExplorerResult(contents, {
    metadata: options.analysis.metadata,
  });
}

export type RenderWorkflowJsonOptions = {
  analysis: TemporalAnalysisDocument;
  workflow: string;
};

/** Returns the canonical JSON model for one Workflow. */
export function renderWorkflowJson(
  options: RenderWorkflowJsonOptions,
): TemporalExplorerResult<WorkflowDefinition> {
  const workflow = options.analysis.workflows.find(
    (candidate) => candidate.name === options.workflow,
  );

  if (!workflow) {
    throw new Error(`Workflow "${options.workflow}" was not found.`);
  }

  return createTemporalExplorerResult(workflow, {
    diagnostics: workflow.diagnostics,
    metadata: options.analysis.metadata,
  });
}

function isLoadedProject(
  value: TemporalExplorerProject | LoadTemporalExplorerProjectOptions,
): value is TemporalExplorerProject {
  return (
    typeof value.root === 'string' &&
    typeof value.tsconfig === 'string' &&
    Array.isArray(value.workflowFiles) &&
    'outputDirectory' in value
  );
}

/**
 * Analyzes a project and returns its diagnostics with configured severity
 * overrides applied, mirroring the CLI `check` command.
 */
export async function runDiagnostics(
  projectOrOptions: TemporalExplorerProject | LoadTemporalExplorerProjectOptions = {},
): Promise<TemporalExplorerResult<Diagnostic[]>> {
  const project = isLoadedProject(projectOrOptions)
    ? projectOrOptions
    : await loadTemporalExplorerProject(projectOrOptions);
  const analysis = await analyzeLoadedProject(project);
  const diagnostics = applySeverityOverrides(
    analysis.diagnostics,
    project.configuration?.diagnostics,
  );

  return createTemporalExplorerResult(diagnostics, {
    diagnostics,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
    metadata: analysis.metadata,
  });
}
