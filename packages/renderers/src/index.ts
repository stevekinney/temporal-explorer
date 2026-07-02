import {
  renderWorkflowIndexMarkdown,
  renderWorkflowMarkdown,
  type CreateDocumentationSetOptions,
} from './markdown';
import { renderWorkflowMermaid } from './mermaid';
import { sortWorkflows } from './shared';

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
    files.push({
      path: `${workflow.name}.md`,
      contents: renderWorkflowMarkdown({ ...options, workflowName: workflow.name }),
    });
    files.push({
      path: `${workflow.name}.mmd`,
      contents: renderWorkflowMermaid(options.analysis, workflow.name),
    });
  }

  return files.toSorted((left, right) => left.path.localeCompare(right.path));
}

export { renderWorkflowDeclaration } from './declarations';
export { renderWorkflowIndexMarkdown, renderWorkflowMarkdown, renderWorkflowMermaid };
export type { CreateDocumentationSetOptions };
