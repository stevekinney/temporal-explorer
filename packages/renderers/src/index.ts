import {
  renderWorkflowIndexMarkdown,
  renderWorkflowMarkdown,
  type CreateDocumentationSetOptions,
} from './markdown';
import { renderWorkflowMermaid } from './mermaid';
import { sortWorkflows, workflowSlug } from './shared';

export type DocumentationFile = {
  path: string;
  contents: string;
};

/** Creates the full deterministic documentation set for an analysis document. */
export function createDocumentationSet(
  options: CreateDocumentationSetOptions,
): DocumentationFile[] {
  const files: DocumentationFile[] = [
    {
      path: 'index.md',
      contents: renderWorkflowIndexMarkdown(options),
    },
  ];

  for (const workflow of sortWorkflows(options.analysis.workflows)) {
    // File names key on the unique slug, not the display name, so versioned
    // workflows that share a registered name do not overwrite each other.
    const slug = workflowSlug(workflow);
    files.push({
      path: `${slug}.md`,
      contents: renderWorkflowMarkdown({ ...options, workflowName: slug }),
    });
    files.push({
      path: `${slug}.mmd`,
      contents: renderWorkflowMermaid(options.analysis, slug),
    });
  }

  return files.toSorted((left, right) => left.path.localeCompare(right.path));
}

export { renderWorkflowDeclaration } from './declarations';
export { findWorkflow, getWorkflow, workflowSlug } from './shared';
export { renderWorkflowIndexMarkdown, renderWorkflowMarkdown, renderWorkflowMermaid };
export type { CreateDocumentationSetOptions };
