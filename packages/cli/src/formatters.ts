import type { TemporalAnalysisDocument } from '@temporal-explorer/api';

function formatWorkflowSignature(workflow: TemporalAnalysisDocument['workflows'][number]): string {
  const args = workflow.signature.args
    .map((arg) => `${arg.displayName ?? 'arg'}: ${arg.display}`)
    .join(', ');

  return `${workflow.name}(${args}): ${workflow.signature.result.display}`;
}

export function formatList(analysis: TemporalAnalysisDocument): string {
  const lines = ['Workflows', ''];

  for (const workflow of analysis.workflows) {
    lines.push(`  ${workflow.name}`);
    lines.push(`    ${workflow.source.path}`);
    lines.push(`    signature: ${formatWorkflowSignature(workflow)}`);
    lines.push(
      `    activities: ${workflow.temporalCommands.map((command) => command.name).join(', ') || 'none'}`,
    );
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function formatShow(analysis: TemporalAnalysisDocument, workflowName: string): string {
  const workflow = analysis.workflows.find((candidate) => candidate.name === workflowName);

  if (!workflow) {
    throw new Error(`Workflow "${workflowName}" was not found.`);
  }

  const lines = [
    formatWorkflowSignature(workflow),
    '',
    'Source',
    `  ${workflow.source.path}:${workflow.source.start.line}`,
    '',
    'Activities',
  ];

  if (workflow.temporalCommands.length === 0) {
    lines.push('  none');
  } else {
    for (const command of workflow.temporalCommands) {
      lines.push(`  ${command.name} (${command.source.path}:${command.source.start.line})`);
    }
  }

  lines.push('', 'Diagnostics');

  if (workflow.diagnostics.length === 0) {
    lines.push('  none');
  } else {
    for (const diagnostic of workflow.diagnostics) {
      lines.push(`  ${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
