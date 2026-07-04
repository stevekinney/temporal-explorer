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

type MessageRow = {
  kind: 'Signal' | 'Query' | 'Update';
  id: string;
  name: string;
  payload: string;
  source: string;
  received: string;
};

function collectMessageRows(
  workflow: WorkflowDefinition,
  overlay: ExecutionOverlayDocument | undefined,
): MessageRow[] {
  const formatPayload = (args: { display: string }[]): string =>
    args.map((arg) => `\`${arg.display}\``).join(', ') || 'none';

  return [
    ...workflow.messageSurface.signals.map((signal): MessageRow => ({
      kind: 'Signal',
      id: signal.id,
      name: signal.name,
      payload: formatPayload(signal.args),
      source: formatSource(signal),
      received: isObserved(signal.id, overlay) ? 'yes' : 'no',
    })),
    ...workflow.messageSurface.queries.map((query): MessageRow => ({
      kind: 'Query',
      id: query.id,
      name: query.name,
      payload: formatPayload(query.args),
      source: formatSource(query),
      received: 'not recorded',
    })),
    ...workflow.messageSurface.updates.map((update): MessageRow => ({
      kind: 'Update',
      id: update.id,
      name: update.name,
      payload: formatPayload(update.args),
      source: formatSource(update),
      received: isObserved(update.id, overlay) ? 'yes' : 'no',
    })),
  ];
}

function appendMessagesSection(
  lines: string[],
  workflow: WorkflowDefinition,
  overlay: ExecutionOverlayDocument | undefined,
): void {
  lines.push('', '## Messages', '');
  const rows = collectMessageRows(workflow, overlay);

  if (rows.length === 0) {
    lines.push('- none');
    return;
  }

  lines.push(
    ...createAlignedMarkdownTable(
      ['Kind', 'Name', 'Payload', 'Source', 'Received', 'Confidence'],
      ['left', 'left', 'left', 'left', 'left', 'left'],
      rows.map((row) => [
        row.kind,
        `\`${row.name}\``,
        row.payload,
        `\`${row.source}\``,
        row.received,
        row.kind === 'Query' ? 'exact' : getMappingConfidence(row.id, overlay),
      ]),
    ),
  );

  if (workflow.messageSurface.queries.length > 0) {
    lines.push(
      '',
      'Queries are served from Workflow state and do not normally add events to Event History.',
    );
  }
}

const operationCommandKinds = [
  'child-workflow',
  'external-workflow',
  'continue-as-new',
  'patch',
  'cancellation-scope',
  'dynamic',
] as const;

function appendOperationsSection(
  lines: string[],
  workflow: WorkflowDefinition,
  overlay: ExecutionOverlayDocument | undefined,
): void {
  const operations = operationCommandKinds
    .flatMap((kind) => getCommandsOfKind(workflow, kind))
    .toSorted((left, right) => left.staticOrder - right.staticOrder);

  lines.push('', '## Temporal Operations', '');

  if (operations.length === 0) {
    lines.push('- none');
    return;
  }

  lines.push(
    ...createAlignedMarkdownTable(
      ['Order', 'Kind', 'Target', 'Source', 'Observed', 'Confidence'],
      ['right', 'left', 'left', 'left', 'left', 'left'],
      operations.map((command) => [
        String(command.staticOrder + 1),
        command.kind,
        command.deprecated ? `\`${command.name}\` (deprecated)` : `\`${command.name}\``,
        `\`${formatSource(command)}\``,
        isObserved(command.id, overlay) ? 'yes' : 'no',
        getMappingConfidence(command.id, overlay),
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
  appendOperationsSection(lines, workflow, overlay);
  appendRuntimeSummary(lines, overlay);

  lines.push('', '## Warnings', '');

  if (workflow.diagnostics.length === 0) {
    lines.push('- none');
  }

  for (const diagnostic of workflow.diagnostics) {
    lines.push(`- ${diagnostic.severity}: ${diagnostic.message}`);
  }

  return `${lines.join('\n')}\n`;
}
