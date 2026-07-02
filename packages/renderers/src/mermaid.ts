import type { TemporalAnalysisDocument, TemporalCommand } from '@temporal-explorer/schemas';

import { getWorkflow } from './shared';

function toMermaidId(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_]/g, '_');
}

function toMermaidLabel(value: string): string {
  return value.replaceAll('"', "'");
}

const flowCommandKinds = new Set<TemporalCommand['kind']>([
  'activity',
  'timer',
  'condition',
  'child-workflow',
  'external-workflow',
  'continue-as-new',
  'patch',
  'dynamic',
]);

function renderCommandNode(command: TemporalCommand): string {
  const id = toMermaidId(command.id);
  const label = toMermaidLabel(command.name);

  if (command.kind === 'condition' || command.kind === 'patch') {
    return `  ${id}{"${label}"}`;
  }

  if (command.kind === 'timer') {
    return `  ${id}(("${label}"))`;
  }

  if (command.kind === 'child-workflow' || command.kind === 'external-workflow') {
    return `  ${id}[["${label}"]]`;
  }

  if (command.kind === 'dynamic') {
    return `  ${id}[/"${label}"/]`;
  }

  return `  ${id}["${label}"]`;
}

/** Renders one Workflow's static structure as a Mermaid flowchart export. */
export function renderWorkflowMermaid(
  analysis: TemporalAnalysisDocument,
  workflowName: string,
): string {
  const workflow = getWorkflow(analysis, workflowName);
  const commands = workflow.temporalCommands
    .filter((command) => flowCommandKinds.has(command.kind))
    .toSorted((left, right) => left.staticOrder - right.staticOrder);
  const lines = ['flowchart TD', `  start(["${workflow.name}"])`];

  for (const command of commands) {
    lines.push(renderCommandNode(command));
  }

  lines.push('  complete(["complete"])');

  const nodeIds = ['start', ...commands.map((command) => toMermaidId(command.id)), 'complete'];

  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    lines.push(`  ${nodeIds[index]} --> ${nodeIds[index + 1]}`);
  }

  return `${lines.join('\n')}\n`;
}
