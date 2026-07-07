/**
 * Structural gate: asserts each construct fixture's committed `analysis.json` actually
 * contains the control-flow node it was written to exercise.
 *
 * A missing construct is an *invisible* failure — if the analyzer silently does not emit
 * a `switch`, a `do-while`, or a `race`, the rendered graph just looks like a simpler but
 * valid workflow, so neither a screenshot nor a vision review would flag it. This gate walks
 * the workflow's `body.nodes` tree, collects a signature for every node, and fails loudly if
 * any expected signature is absent.
 */
import { temporalAnalysisDocumentSchema, type FlowNode } from '@temporal-explorer/schemas';

const fixturesRoot = new URL('../../fixtures/', import.meta.url);

/** Signatures each fixture's flow tree must contain, keyed by fixture directory name. */
const expectedConstructs: Record<string, string[]> = {
  'dynamic-parallel': ['parallel:all:dynamic'],
  race: ['parallel:race:fixed', 'branch:if'],
  'all-settled': ['parallel:allSettled:fixed'],
  'promise-any': ['parallel:any:fixed'],
  'switch-routing': ['branch:switch', 'branch:multi'],
  'branch-chain': ['branch:if', 'branch:multi'],
  'counting-loop': ['loop:for', 'terminal:break', 'terminal:continue'],
  'while-loop': ['loop:while'],
  'do-while-loop': ['loop:do-while'],
  'for-in-loop': ['loop:for-in', 'terminal:continue'],
  'try-finally': ['try:finalizer'],
  'try-catch-finally': ['try:handler', 'try:finalizer'],
  'nested-orchestration': ['loop:for-of', 'branch:if', 'parallel:all:fixed', 'try:handler'],
};

/** The signature(s) a branch node contributes, independent of its children. */
function branchSignatures(node: Extract<FlowNode, { type: 'branch' }>): string[] {
  const signatures = [`branch:${node.branchKind}`];
  const hasNestedOtherwiseBranch =
    node.otherwise?.some((child) => child.type === 'branch') ?? false;
  // "multi" marks a real fan-out: an if/else-if/else chain or a switch with a default.
  if (node.clauses.length + (node.otherwise ? 1 : 0) >= 3 || hasNestedOtherwiseBranch) {
    signatures.push('branch:multi');
  }
  return signatures;
}

/** The signature(s) a try node contributes, independent of its children. */
function trySignatures(node: Extract<FlowNode, { type: 'try' }>): string[] {
  const signatures = ['try'];
  if (node.handler) signatures.push('try:handler');
  if (node.finalizer) signatures.push('try:finalizer');
  return signatures;
}

/** The signature(s) a single node contributes on its own, ignoring nested bodies. */
function ownSignatures(node: FlowNode): string[] {
  switch (node.type) {
    case 'command':
      return ['command'];
    case 'branch':
      return branchSignatures(node);
    case 'loop':
      return [`loop:${node.loopKind}`];
    case 'parallel':
      return [`parallel:${node.parallelKind}:${node.cardinality}`];
    case 'try':
      return trySignatures(node);
    case 'region':
      return ['region'];
    case 'terminal':
      return [`terminal:${node.terminalKind}`];
  }
}

/** The nested flow-node bodies to recurse into for a node (undefined slots are skipped). */
function childBodies(node: FlowNode): (FlowNode[] | undefined)[] {
  switch (node.type) {
    case 'branch':
      return [...node.clauses.map((clause) => clause.body), node.otherwise];
    case 'loop':
      return [node.initializer, node.condition, node.update, node.body];
    case 'parallel':
      return [...(node.branches ?? []), node.templateBranch];
    case 'try':
      return [node.body, node.handler?.body, node.finalizer];
    case 'region':
      return [node.body];
    default:
      return [];
  }
}

/** Emits every construct signature present in a flow tree. */
function collectSignatures(nodes: FlowNode[], into: Set<string>): void {
  for (const node of nodes) {
    for (const signature of ownSignatures(node)) into.add(signature);
    for (const body of childBodies(node)) {
      if (body) collectSignatures(body, into);
    }
  }
}

let failures = 0;

for (const [fixture, expected] of Object.entries(expectedConstructs)) {
  const analysisUrl = new URL(`${fixture}/.temporal-explorer/analysis.json`, fixturesRoot);
  const parsed = temporalAnalysisDocumentSchema.safeParse(await Bun.file(analysisUrl).json());

  if (!parsed.success) {
    console.error(`FAIL ${fixture}: analysis.json failed schema validation.`);
    failures += 1;
    continue;
  }

  const signatures = new Set<string>();
  for (const workflow of parsed.data.workflows) {
    collectSignatures(workflow.body.nodes, signatures);
  }

  const missing = expected.filter((signature) => !signatures.has(signature));

  if (missing.length > 0) {
    console.error(`FAIL ${fixture}: missing construct(s) ${missing.join(', ')}`);
    failures += 1;
  } else {
    console.log(`OK   ${fixture}: ${expected.join(', ')}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} fixture(s) are missing an expected construct.`);
  process.exit(1);
}

console.log(
  `\nAll ${Object.keys(expectedConstructs).length} construct fixtures emit their intended control-flow nodes.`,
);
