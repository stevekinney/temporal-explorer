/**
 * Project-level usage mirroring CLI defaults: discovery, analysis,
 * diagnostics with configured severities, and Markdown rendering.
 */
import {
  analyzeProject,
  loadTemporalExplorerProject,
  renderMarkdown,
  runDiagnostics,
} from '@temporal-explorer/api';

const root = new URL('../fixtures/approval', import.meta.url).pathname;
const project = await loadTemporalExplorerProject({ root });
const analysis = await analyzeProject(project);
const markdown = renderMarkdown({
  analysis: analysis.value,
  workflowName: 'approvalWorkflow',
});
const diagnostics = await runDiagnostics(project);

if (!markdown.value.includes('# approvalWorkflow') || diagnostics.value.length !== 0) {
  throw new Error('Project-level example produced unexpected output.');
}

console.log(
  `analyze-project: ${analysis.value.workflows.length} workflow(s), ${diagnostics.value.length} diagnostic(s).`,
);
