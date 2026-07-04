import type {
  FlowNode,
  TemporalAnalysisDocument,
  TemporalCommand,
} from '@temporal-explorer/schemas';

import { commandDisplayName, getWorkflow } from './shared';

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

function toMermaidId(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_]/g, '_');
}

function toMermaidLabel(value: string): string {
  return value.replaceAll('"', "'").replaceAll(/[\r\n]+/g, ' ');
}

const flowCommandKinds = new Set<TemporalCommand['kind']>([
  'activity',
  'timer',
  'condition',
  'child-workflow',
  'external-workflow',
  'continue-as-new',
  'patch',
  'nexus-operation',
  'search-attribute',
  'dynamic',
]);

/** Wraps a label in the Mermaid shape that matches a command kind. */
function shapeForKind(kind: TemporalCommand['kind'], id: string, label: string): string {
  if (kind === 'condition' || kind === 'patch') {
    return `  ${id}{"${label}"}`;
  }

  if (kind === 'timer') {
    return `  ${id}(("${label}"))`;
  }

  if (kind === 'child-workflow' || kind === 'external-workflow') {
    return `  ${id}[["${label}"]]`;
  }

  if (kind === 'nexus-operation') {
    return `  ${id}[/"${label}"/]`;
  }

  if (kind === 'dynamic') {
    return `  ${id}[/"${label}"/]`;
  }

  return `  ${id}["${label}"]`;
}

type RenderContext = {
  nodes: string[];
  edges: string[];
  counter: { value: number };
  startId: string;
  commandsById: Map<string, TemporalCommand>;
};

function nextNodeId(context: RenderContext): string {
  context.counter.value += 1;
  return `n${context.counter.value}`;
}

function pushEdge(context: RenderContext, from: string, to: string, label?: string): void {
  context.edges.push(
    label ? `  ${from} -->|"${toMermaidLabel(label)}"| ${to}` : `  ${from} --> ${to}`,
  );
}

/** Renders a sequence of flow nodes from `entry`, returning the exit node id or undefined if the path terminates. */
function renderSequence(
  nodes: FlowNode[],
  entry: string,
  context: RenderContext,
  entryLabel?: string,
): string | undefined {
  let cursor: string | undefined = entry;
  let pendingLabel = entryLabel;

  for (const node of nodes) {
    if (cursor === undefined) {
      break; // Unreachable: a terminal ended this path.
    }

    cursor = renderNode(node, cursor, context, pendingLabel);
    pendingLabel = undefined;
  }

  return cursor;
}

/** Renders one branch/parallel arm and connects its exit into `join`; empty arms draw a labeled edge straight to the join. */
function renderArmInto(
  body: FlowNode[],
  entry: string,
  join: string,
  label: string | undefined,
  context: RenderContext,
): boolean {
  if (body.length === 0) {
    pushEdge(context, entry, join, label);
    return true;
  }

  const exit = renderSequence(body, entry, context, label);

  if (exit !== undefined) {
    pushEdge(context, exit, join);
    return true;
  }

  return false;
}

function renderCommandNode(
  node: Extract<FlowNode, { type: 'command' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string {
  const command = context.commandsById.get(node.commandId);
  const id = toMermaidId(node.id);
  const kind = command?.kind ?? 'activity';
  const name = toMermaidLabel(command ? commandDisplayName(command) : node.commandId);
  const suffix = command?.cardinality === 'fan-out' ? ' ×N' : '';

  context.nodes.push(shapeForKind(kind, id, `${name}${suffix}`));
  pushEdge(context, entry, id, label);

  return id;
}

function renderTerminalNode(
  node: Extract<FlowNode, { type: 'terminal' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): undefined {
  const id = toMermaidId(node.id);

  if (node.terminalKind === 'continue-as-new') {
    const command = node.commandId ? context.commandsById.get(node.commandId) : undefined;
    context.nodes.push(`  ${id}[/"continue as new: ${toMermaidLabel(command?.name ?? '')}"/]`);
    pushEdge(context, entry, id, label);
    pushEdge(context, id, context.startId, 'loop');
    return undefined;
  }

  const terminalLabels: Record<string, string> = {
    return: 'return',
    throw: 'throw',
    break: 'break',
    continue: 'continue',
  };

  context.nodes.push(`  ${id}(["${terminalLabels[node.terminalKind] ?? node.terminalKind}"])`);
  pushEdge(context, entry, id, label);

  return undefined;
}

function renderBranchNode(
  node: Extract<FlowNode, { type: 'branch' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string {
  const decision = toMermaidId(node.id);
  const testCommand = node.testCommandId ? context.commandsById.get(node.testCommandId) : undefined;
  const decisionLabel = testCommand?.name ?? (node.branchKind === 'switch' ? 'switch' : 'if');
  context.nodes.push(`  ${decision}{"${toMermaidLabel(decisionLabel)}"}`);
  pushEdge(context, entry, decision, label);

  const join = nextNodeId(context);
  context.nodes.push(`  ${join}(( ))`);

  for (const clause of node.clauses) {
    renderArmInto(clause.body, decision, join, clause.label, context);
  }

  // An explicit `else`, or the implicit fall-through when there is no else.
  renderArmInto(node.otherwise ?? [], decision, join, 'else', context);

  return join;
}

function renderLoopNode(
  node: Extract<FlowNode, { type: 'loop' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string {
  const loop = toMermaidId(node.id);
  context.nodes.push(`  ${loop}{"loop (${node.loopKind})"}`);
  pushEdge(context, entry, loop, label);

  const bodyExit = renderSequence(node.body, loop, context, 'each');
  if (bodyExit !== undefined) {
    pushEdge(context, bodyExit, loop, 'repeat');
  }

  return loop;
}

function renderParallelNode(
  node: Extract<FlowNode, { type: 'parallel' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string {
  const fork = toMermaidId(node.id);
  context.nodes.push(`  ${fork}{{"Promise.${node.parallelKind}"}}`);
  pushEdge(context, entry, fork, label);

  const join = nextNodeId(context);
  context.nodes.push(`  ${join}(( ))`);

  if (node.cardinality === 'dynamic') {
    renderArmInto(node.templateBranch ?? [], fork, join, '×N', context);
    return join;
  }

  for (const branch of node.branches ?? []) {
    renderArmInto(branch, fork, join, undefined, context);
  }

  return join;
}

function renderTryNode(
  node: Extract<FlowNode, { type: 'try' }>,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string | undefined {
  const bodyExit = renderSequence(node.body, entry, context, label);
  const converge = nextNodeId(context);
  context.nodes.push(`  ${converge}(( ))`);

  if (bodyExit !== undefined) {
    pushEdge(context, bodyExit, converge);
  }

  if (node.handler) {
    const handlerExit = renderSequence(node.handler.body, entry, context, 'catch');
    if (handlerExit !== undefined) {
      pushEdge(context, handlerExit, converge);
    }
  }

  if (node.finalizer && node.finalizer.length > 0) {
    return renderSequence(node.finalizer, converge, context, 'finally');
  }

  return converge;
}

function renderNode(
  node: FlowNode,
  entry: string,
  context: RenderContext,
  label: string | undefined,
): string | undefined {
  switch (node.type) {
    case 'command':
      return renderCommandNode(node, entry, context, label);
    case 'terminal':
      return renderTerminalNode(node, entry, context, label);
    case 'branch':
      return renderBranchNode(node, entry, context, label);
    case 'loop':
      return renderLoopNode(node, entry, context, label);
    case 'parallel':
      return renderParallelNode(node, entry, context, label);
    case 'try':
      return renderTryNode(node, entry, context, label);
    default:
      return undefined;
  }
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

  const commandsById = new Map(workflow.temporalCommands.map((command) => [command.id, command]));
  const used = new Set([...commandsById.keys()].map(toMermaidId));
  const startId = reserveNodeId('start', used);
  const completeId = reserveNodeId('complete', used);
  const context: RenderContext = {
    nodes: [],
    edges: [],
    counter: { value: 0 },
    startId,
    commandsById,
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
