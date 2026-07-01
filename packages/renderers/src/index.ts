import type {
  ExecutionOverlayDocument,
  RuntimeTraceDocument,
  TemporalAnalysisDocument,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

export type DocumentationFile = {
  path: string;
  contents: string;
};

export type CreateDocumentationSetOptions = {
  analysis: TemporalAnalysisDocument;
  traces?: RuntimeTraceDocument[];
  overlays?: ExecutionOverlayDocument[];
};

function getWorkflow(analysis: TemporalAnalysisDocument, workflowName: string): WorkflowDefinition {
  const workflow = analysis.workflows.find((candidate) => candidate.name === workflowName);

  if (!workflow) {
    throw new Error(`Workflow "${workflowName}" was not found.`);
  }

  return workflow;
}

function sortWorkflows(workflows: WorkflowDefinition[]): WorkflowDefinition[] {
  return workflows.toSorted((left, right) => left.name.localeCompare(right.name));
}

function getActivityCommands(workflow: WorkflowDefinition): TemporalCommand[] {
  return workflow.temporalCommands
    .filter((command) => command.kind === 'activity')
    .toSorted((left, right) => left.staticOrder - right.staticOrder);
}

function formatSource(command: TemporalCommand | WorkflowDefinition): string {
  return `${command.source.path}:${command.source.start.line}`;
}

function getOverlayForWorkflow(
  workflow: WorkflowDefinition,
  overlays: ExecutionOverlayDocument[],
): ExecutionOverlayDocument | undefined {
  return overlays.find((overlay) => overlay.workflow === workflow.name);
}

function isObserved(
  command: TemporalCommand,
  overlay: ExecutionOverlayDocument | undefined,
): boolean {
  return Boolean(overlay?.staticNodes.some((node) => node.id === command.id && node.observed));
}

function getMappingConfidence(
  command: TemporalCommand,
  overlay: ExecutionOverlayDocument | undefined,
): string {
  return (
    overlay?.mappings.find((mapping) => mapping.staticNodeId === command.id)?.confidence ??
    'unknown'
  );
}

function formatWorkflowSignature(workflow: WorkflowDefinition): string {
  const args = workflow.signature.args
    .map((arg) => `${arg.displayName ?? 'arg'}: ${arg.display}`)
    .join(', ');

  return `${workflow.name}(${args}): ${workflow.signature.result.display}`;
}

function createAlignedMarkdownTable(
  headers: string[],
  alignments: ('left' | 'right')[],
  rows: string[][],
): string[] {
  const tableRows = [headers, ...rows];
  const widths = headers.map((_, columnIndex) =>
    Math.max(...tableRows.map((row) => row[columnIndex]?.length ?? 0)),
  );
  const separator = widths.map((width, columnIndex) => {
    const dashCount = Math.max(width - (alignments[columnIndex] === 'right' ? 1 : 0), 3);
    return alignments[columnIndex] === 'right'
      ? `${'-'.repeat(dashCount)}:`
      : '-'.repeat(dashCount);
  });

  return [
    formatAlignedTableRow(headers, widths, alignments),
    formatAlignedTableRow(separator, widths, alignments),
    ...rows.map((row) => formatAlignedTableRow(row, widths, alignments)),
  ];
}

function formatAlignedTableRow(
  cells: string[],
  widths: number[],
  alignments: ('left' | 'right')[],
): string {
  return `| ${cells
    .map((cell, index) =>
      alignments[index] === 'right'
        ? cell.padStart(widths[index] ?? 0)
        : cell.padEnd(widths[index] ?? 0),
    )
    .join(' | ')} |`;
}

export function renderWorkflowIndexMarkdown(options: CreateDocumentationSetOptions): string {
  const lines = ['# Temporal Workflow Explorer', '', '## Workflows', ''];

  for (const workflow of sortWorkflows(options.analysis.workflows)) {
    lines.push(`- [${workflow.name}](./${workflow.name}.md) - \`${formatSource(workflow)}\``);
  }

  lines.push('', '## Artifacts', '');
  lines.push(`- Static analysis: \`${options.analysis.artifactId}\``);

  for (const trace of options.traces ?? []) {
    lines.push(`- Runtime trace: \`${trace.artifactId}\` (${trace.execution.status})`);
  }

  for (const overlay of options.overlays ?? []) {
    lines.push(`- Execution overlay: \`${overlay.artifactId}\``);
  }

  return `${lines.join('\n')}\n`;
}

export function renderWorkflowMarkdown(
  options: CreateDocumentationSetOptions & { workflowName: string },
): string {
  const workflow = getWorkflow(options.analysis, options.workflowName);
  const overlay = getOverlayForWorkflow(workflow, options.overlays ?? []);
  const commands = getActivityCommands(workflow);
  const lines = [
    `# ${workflow.name}`,
    '',
    `Source: \`${formatSource(workflow)}\``,
    '',
    `Signature: \`${formatWorkflowSignature(workflow)}\``,
    '',
    '## Activities',
    '',
  ];
  lines.push(
    ...createAlignedMarkdownTable(
      ['Order', 'Activity', 'Source', 'Observed', 'Confidence'],
      ['right', 'left', 'left', 'left', 'left'],
      commands.map((command) => [
        String(command.staticOrder + 1),
        `\`${command.name}\``,
        `\`${formatSource(command)}\``,
        isObserved(command, overlay) ? 'yes' : 'no',
        getMappingConfidence(command, overlay),
      ]),
    ),
  );

  lines.push('', '## Runtime Summary', '');

  if (overlay) {
    lines.push(
      `- Mapped runtime operations: ${overlay.mappings.length - overlay.coverage.nodes.unmappedRuntimeOperations}/${overlay.mappings.length}`,
    );
    lines.push(
      `- Unmapped runtime operations: ${overlay.coverage.nodes.unmappedRuntimeOperations}`,
    );
    lines.push('- Payload previews: redacted by default');
  } else {
    lines.push('- No runtime overlay artifact was provided.');
  }

  lines.push('', '## Warnings', '');
  lines.push(workflow.diagnostics.length === 0 ? '- none' : '');

  for (const diagnostic of workflow.diagnostics) {
    lines.push(`- ${diagnostic.severity}: ${diagnostic.message}`);
  }

  return `${lines.join('\n')}\n`;
}

function toMermaidId(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_]/g, '_');
}

export function renderWorkflowMermaid(
  analysis: TemporalAnalysisDocument,
  workflowName: string,
): string {
  const workflow = getWorkflow(analysis, workflowName);
  const commands = getActivityCommands(workflow);
  const lines = ['flowchart TD', `  start(["${workflow.name}"])`];

  for (const command of commands) {
    lines.push(`  ${toMermaidId(command.id)}["${command.name}"]`);
  }

  lines.push('  complete(["complete"])');

  const nodeIds = ['start', ...commands.map((command) => toMermaidId(command.id)), 'complete'];

  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    lines.push(`  ${nodeIds[index]} --> ${nodeIds[index + 1]}`);
  }

  return `${lines.join('\n')}\n`;
}

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
