import type {
  ExecutionOverlayDocument,
  RuntimeTraceDocument,
  TemporalAnalysisDocument,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import {
  createAlignedMarkdownTable,
  formatSource,
  formatWorkflowSignature,
  getCommandsOfKind,
  getMappingConfidence,
  getOverlayForWorkflow,
  getWorkflow,
  isObserved,
  sortWorkflows,
} from './shared';

export type CreateDocumentationSetOptions = {
  analysis: TemporalAnalysisDocument;
  traces?: RuntimeTraceDocument[];
  overlays?: ExecutionOverlayDocument[];
};

/** Renders the deterministic Workflow index page. */
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

function appendActivitiesSection(
  lines: string[],
  workflow: WorkflowDefinition,
  overlay: ExecutionOverlayDocument | undefined,
): void {
  const commands = getCommandsOfKind(workflow, 'activity');
  lines.push('## Activities', '');

  if (commands.length === 0) {
    lines.push('- none');
    return;
  }

  lines.push(
    ...createAlignedMarkdownTable(
      ['Order', 'Activity', 'Source', 'Observed', 'Confidence'],
      ['right', 'left', 'left', 'left', 'left'],
      commands.map((command) => [
        String(command.staticOrder + 1),
        `\`${command.name}\``,
        `\`${formatSource(command)}\``,
        isObserved(command.id, overlay) ? 'yes' : 'no',
        getMappingConfidence(command.id, overlay),
      ]),
    ),
  );
}

function appendMessagesSection(
  lines: string[],
  workflow: WorkflowDefinition,
  overlay: ExecutionOverlayDocument | undefined,
): void {
  lines.push('', '## Messages', '');
  const signals = workflow.messageSurface.signals;

  if (signals.length === 0) {
    lines.push('- none');
    return;
  }

  lines.push(
    ...createAlignedMarkdownTable(
      ['Kind', 'Name', 'Payload', 'Source', 'Received', 'Confidence'],
      ['left', 'left', 'left', 'left', 'left', 'left'],
      signals.map((signal) => [
        'Signal',
        `\`${signal.name}\``,
        signal.args.map((arg) => `\`${arg.display}\``).join(', ') || 'none',
        `\`${formatSource(signal)}\``,
        isObserved(signal.id, overlay) ? 'yes' : 'no',
        getMappingConfidence(signal.id, overlay),
      ]),
    ),
  );
}

function appendWaitsSection(
  lines: string[],
  workflow: WorkflowDefinition,
  overlay: ExecutionOverlayDocument | undefined,
): void {
  lines.push('', '## Waits', '');
  const waits = [
    ...getCommandsOfKind(workflow, 'condition'),
    ...getCommandsOfKind(workflow, 'timer'),
  ].toSorted((left, right) => left.staticOrder - right.staticOrder);

  if (waits.length === 0) {
    lines.push('- none');
    return;
  }

  lines.push(
    ...createAlignedMarkdownTable(
      ['Order', 'Kind', 'Expression', 'Source', 'Observed', 'Confidence'],
      ['right', 'left', 'left', 'left', 'left', 'left'],
      waits.map((command) => [
        String(command.staticOrder + 1),
        command.kind,
        `\`${command.name}\``,
        `\`${formatSource(command)}\``,
        isObserved(command.id, overlay) ? 'yes' : 'no',
        getMappingConfidence(command.id, overlay),
      ]),
    ),
  );
}

function appendRuntimeSummary(
  lines: string[],
  overlay: ExecutionOverlayDocument | undefined,
): void {
  lines.push('', '## Runtime Summary', '');

  if (!overlay) {
    lines.push('- No runtime overlay artifact was provided.');
    return;
  }

  lines.push(
    `- Mapped runtime operations: ${overlay.mappings.length - overlay.coverage.nodes.unmappedRuntimeOperations}/${overlay.mappings.length}`,
  );
  lines.push(`- Unmapped runtime operations: ${overlay.coverage.nodes.unmappedRuntimeOperations}`);

  if (overlay.coverage.messages.receivedSignals.length > 0) {
    lines.push(`- Received Signals: ${overlay.coverage.messages.receivedSignals.join(', ')}`);
  }

  if (overlay.coverage.timers.staticTotal > 0) {
    lines.push(
      `- Timers: ${overlay.coverage.timers.fired} fired, ${overlay.coverage.timers.canceled} canceled, ${overlay.coverage.timers.pending} pending`,
    );
  }

  lines.push('- Payload previews: redacted by default');
}

/** Renders one deterministic Workflow documentation page. */
export function renderWorkflowMarkdown(
  options: CreateDocumentationSetOptions & { workflowName: string },
): string {
  const workflow = getWorkflow(options.analysis, options.workflowName);
  const overlay = getOverlayForWorkflow(workflow, options.overlays ?? []);
  const lines = [
    `# ${workflow.name}`,
    '',
    `Source: \`${formatSource(workflow)}\``,
    '',
    `Signature: \`${formatWorkflowSignature(workflow)}\``,
    '',
  ];

  appendActivitiesSection(lines, workflow, overlay);
  appendMessagesSection(lines, workflow, overlay);
  appendWaitsSection(lines, workflow, overlay);
  appendRuntimeSummary(lines, overlay);

  lines.push('', '## Warnings', '');
  lines.push(workflow.diagnostics.length === 0 ? '- none' : '');

  for (const diagnostic of workflow.diagnostics) {
    lines.push(`- ${diagnostic.severity}: ${diagnostic.message}`);
  }

  return `${lines.join('\n')}\n`;
}
