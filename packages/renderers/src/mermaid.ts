import type { TemporalAnalysisDocument, TemporalCommand } from '@temporal-explorer/schemas';

import {
  flowCommandKinds,
  shapeForKind,
  toMermaidId,
  toMermaidLabel,
} from './mermaid-control-flow';
import { renderStructuredWorkflowMermaid } from './mermaid-structured';
import { getWorkflow } from './shared';

/** Reserves a sentinel node id, disambiguating if a real node already claims it. */
function reserveNodeId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Legacy linear render for documents whose `body.nodes` is empty (older artifacts). */
function renderLinear(commands: TemporalCommand[], workflowName: string): string {
  const flowCommands = commands
    .filter((command) => flowCommandKinds.has(command.kind))
    .toSorted((left, right) => left.staticOrder - right.staticOrder);
  const commandIds = flowCommands.map((command) => toMermaidId(command.id));
  const used = new Set(commandIds);
  const startId = reserveNodeId('start', used);
  const completeId = reserveNodeId('complete', used);
  const lines = ['flowchart TD', `  ${startId}(["${toMermaidLabel(workflowName)}"])`];

  for (const command of flowCommands) {
    lines.push(shapeForKind(command.kind, toMermaidId(command.id), toMermaidLabel(command.name)));
  }

  lines.push(`  ${completeId}(["complete"])`);
  const nodeIds = [startId, ...commandIds, completeId];

  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    lines.push(`  ${nodeIds[index]} --> ${nodeIds[index + 1]}`);
  }

  return `${lines.join('\n')}\n`;
}

/** Renders one Workflow's static control-flow structure as a Mermaid flowchart export. */
export function renderWorkflowMermaid(
  analysis: TemporalAnalysisDocument,
  workflowName: string,
): string {
  const workflow = getWorkflow(analysis, workflowName);

  if (workflow.body.nodes.length === 0) {
    return renderLinear(workflow.temporalCommands, workflow.name);
  }

  const used = new Set(workflow.temporalCommands.map((command) => toMermaidId(command.id)));
  const startId = reserveNodeId('start', used);
  const completeId = reserveNodeId('complete', used);

  return renderStructuredWorkflowMermaid(workflow, startId, completeId);
}
