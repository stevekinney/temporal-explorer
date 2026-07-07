import type { WorkflowDefinition } from '@temporal-explorer/schemas';

import type { RenderContext } from './mermaid-control-context';
import { renderSequence } from './mermaid-control-flow';
import { toMermaidLabel } from './mermaid-format';

export function renderStructuredWorkflowMermaid(
  workflow: WorkflowDefinition,
  startId: string,
  completeId: string,
): string {
  const context: RenderContext = {
    nodes: [],
    edges: [],
    counter: { value: 0 },
    startId,
    commandsById: new Map(workflow.temporalCommands.map((command) => [command.id, command])),
    loopTargets: [],
    breakTargets: [],
    finallyStack: [],
    nodeIdSuffix: '',
    abruptPathCounter: { value: 0 },
  };
  const exit = renderSequence(workflow.body.nodes, context.startId, context);
  const lines = [
    'flowchart TD',
    `  ${startId}(["${toMermaidLabel(workflow.name)}"])`,
    ...context.nodes,
  ];

  if (exit !== undefined) {
    lines.push(`  ${completeId}(["complete"])`);
    context.edges.push(`  ${exit} --> ${completeId}`);
  }

  return `${[...lines, ...context.edges].join('\n')}\n`;
}
