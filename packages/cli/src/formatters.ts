import type { TemporalAnalysisDocument } from '@temporal-explorer/api';

type WorkflowDefinition = TemporalAnalysisDocument['workflows'][number];

function formatWorkflowSignature(workflow: WorkflowDefinition): string {
  const args = workflow.signature.args
    .map((arg) => `${arg.displayName ?? 'arg'}: ${arg.display}`)
    .join(', ');

  return `${workflow.name}(${args}): ${workflow.signature.result.display}`;
}

function getCommandNames(workflow: WorkflowDefinition, kind: string): string[] {
  return workflow.temporalCommands
    .filter((command) => command.kind === kind)
    .toSorted((left, right) => left.staticOrder - right.staticOrder)
    .map((command) => command.name);
}

export function formatList(analysis: TemporalAnalysisDocument): string {
  const lines = ['Workflows', ''];

  for (const workflow of analysis.workflows) {
    lines.push(`  ${workflow.name}`);
    lines.push(`    ${workflow.source.path}`);
    lines.push(`    signature: ${formatWorkflowSignature(workflow)}`);
    lines.push(`    activities: ${getCommandNames(workflow, 'activity').join(', ') || 'none'}`);
    lines.push(
      `    signals: ${
        workflow.messageSurface.signals.map((signal) => signal.name).join(', ') || 'none'
      }`,
    );
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function appendSourceLines(
  lines: string[],
  heading: string,
  entries: { label: string; path: string; line: number }[],
): void {
  lines.push('', heading);

  if (entries.length === 0) {
    lines.push('  none');
    return;
  }

  for (const entry of entries) {
    lines.push(`  ${entry.label} (${entry.path}:${entry.line})`);
  }
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
  ];

  appendSourceLines(
    lines,
    'Activities',
    workflow.temporalCommands
      .filter((command) => command.kind === 'activity')
      .map((command) => ({
        label: command.name,
        path: command.source.path,
        line: command.source.start.line,
      })),
  );

  appendSourceLines(
    lines,
    'Messages',
    workflow.messageSurface.signals.map((signal) => {
      const payload = signal.args.map((arg) => arg.display).join(', ');

      return {
        label: `Signal ${signal.name}(${payload})`,
        path: signal.source.path,
        line: signal.source.start.line,
      };
    }),
  );

  appendSourceLines(
    lines,
    'Waits',
    workflow.temporalCommands
      .filter((command) => command.kind === 'condition' || command.kind === 'timer')
      .map((command) => ({
        label: `${command.kind} ${command.name}`,
        path: command.source.path,
        line: command.source.start.line,
      })),
  );

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
