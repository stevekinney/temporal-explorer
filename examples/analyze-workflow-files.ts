/**
 * Direct file-path usage: analyze explicit Workflow files without project
 * discovery, then render JSON and Mermaid from the same analysis.
 */
import {
  analyzeWorkflowFiles,
  renderWorkflowJson,
  renderWorkflowMermaidFromArtifacts,
} from '@temporal-explorer/api';

const projectRoot = new URL('../fixtures/basic-order', import.meta.url).pathname;
const analysis = await analyzeWorkflowFiles({
  projectRoot,
  tsconfig: 'tsconfig.json',
  workflowFiles: ['src/workflows/basic-order-workflow.ts'],
});

const workflowJson = renderWorkflowJson({
  analysis: analysis.value,
  workflow: 'basicOrderWorkflow',
});
const mermaid = renderWorkflowMermaidFromArtifacts({
  analysisArtifact: analysis.value,
  workflowName: 'basicOrderWorkflow',
});

if (workflowJson.value.temporalCommands.length !== 3 || !mermaid.startsWith('flowchart TD')) {
  throw new Error('Direct file-path example produced unexpected output.');
}

console.log(
  `analyze-workflow-files: ${workflowJson.value.name} with ${workflowJson.value.temporalCommands.length} commands.`,
);
