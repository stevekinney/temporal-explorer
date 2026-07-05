/** Runs the same static-analysis pipeline `@temporal-explorer/api` consumers use, against one sample. */
import {
  analyzeProject,
  loadTemporalExplorerProject,
  renderTypeDeclarations,
  renderWorkflowMermaidFromArtifacts,
  validateArtifact,
  workflowSlug,
} from '@temporal-explorer/api';
import type { TemporalAnalysisDocument, WorkflowDefinition } from '@temporal-explorer/schemas';

import { corpusRootUrl } from './paths';
import type { SampleDiagnosticSummary, SampleResult } from './types';

function summarizeDiagnostics(analysis: TemporalAnalysisDocument): SampleDiagnosticSummary[] {
  return analysis.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
  }));
}

/** Asserts Mermaid rendering is non-empty and declaration rendering is deterministic. */
function assertWorkflowRendering(
  analysis: TemporalAnalysisDocument,
  workflow: WorkflowDefinition,
): void {
  // Address the workflow by its unique slug: versioned samples (worker-versioning)
  // register several implementations under one display name, which is ambiguous.
  const slug = workflowSlug(workflow);
  const mermaid = renderWorkflowMermaidFromArtifacts({
    analysisArtifact: analysis,
    workflowName: slug,
  });

  if (mermaid.trim().length === 0) {
    throw new Error(`renderWorkflowMermaidFromArtifacts returned empty text for "${slug}".`);
  }

  const first = renderTypeDeclarations({ analysis, workflowName: slug });
  const second = renderTypeDeclarations({ analysis, workflowName: slug });

  if (JSON.stringify(first.value) !== JSON.stringify(second.value)) {
    throw new Error(`renderTypeDeclarations was not deterministic for "${slug}".`);
  }
}

export type RunSampleOutcome = Omit<SampleResult, 'classification'>;

/** Loads, analyzes, and validates one sample directory; never throws. */
export async function runSample(sampleName: string): Promise<RunSampleOutcome> {
  const startedAt = performance.now();
  const root = new URL(`${sampleName}/`, corpusRootUrl).pathname;

  try {
    const project = await loadTemporalExplorerProject({ root });
    const result = await analyzeProject(project);
    const validation = validateArtifact(result.value);

    if (!validation.success) {
      const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
      throw new Error(`validateArtifact failed: ${issues}`);
    }

    for (const workflow of result.value.workflows) {
      assertWorkflowRendering(result.value, workflow);
    }

    if (project.workflowFiles.length > 0 && result.value.workflows.length === 0) {
      // A "zero workflows" outcome is only an accepted product limitation when
      // no file matched the discovery globs at all. Files matched but nothing
      // was extracted from them is a real analyzer gap, not a clean result.
      throw new Error(
        `${project.workflowFiles.length} file(s) matched the workflow discovery globs, but zero workflows were extracted.`,
      );
    }

    return {
      outcome: 'passed',
      workflows: result.value.workflows.map((workflow) => workflow.name),
      workflowFileCount: project.workflowFiles.length,
      diagnostics: summarizeDiagnostics(result.value),
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      outcome: 'failed',
      workflows: [],
      workflowFileCount: 0,
      diagnostics: [],
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
