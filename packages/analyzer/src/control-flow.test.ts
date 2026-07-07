import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { FlowNode } from '@temporal-explorer/schemas';

import { analyzeWorkflowFiles } from './index';

const tsconfig = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
  },
  include: ['src/**/*.ts'],
});

async function bodyOf(source: string, workflowName: string): Promise<FlowNode[]> {
  const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-cfg-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await Bun.write(join(root, 'tsconfig.json'), tsconfig);
  await Bun.write(
    join(root, 'src', 'activities.ts'),
    `export async function a(): Promise<void> {}
export async function b(): Promise<void> {}
export async function c(): Promise<string> { return ''; }
`,
  );
  await Bun.write(join(root, 'src', 'workflows.ts'), source);

  const analysis = await analyzeWorkflowFiles({
    projectRoot: root,
    tsconfig: 'tsconfig.json',
    workflowFiles: ['src/workflows.ts'],
  });
  const workflow = analysis.workflows.find((candidate) => candidate.name === workflowName);

  if (!workflow) {
    throw new Error(`Expected the ${workflowName} workflow.`);
  }

  return workflow.body.nodes;
}

const header = `import { proxyActivities, sleep, condition, continueAsNew, executeChild } from '@temporalio/workflow';
import type * as activities from './activities';

const { a, b, c } = proxyActivities<typeof activities>({ startToCloseTimeout: '1m' });

export async function child(name: string): Promise<string> {
  return name;
}
`;

function types(nodes: FlowNode[]): string[] {
  return nodes.map((node) => node.type);
}

describe('control-flow model (body.nodes)', () => {
  it('emits a flat sequence for straight-line code', async () => {
    const nodes = await bodyOf(
      `${header}
export async function seq(): Promise<void> {
  await a();
  await b();
}
`,
      'seq',
    );

    expect(types(nodes)).toEqual(['command', 'command']);
  });

  it('models if/else as a branch with clauses and otherwise', async () => {
    const nodes = await bodyOf(
      `${header}
export async function branchy(flag: boolean): Promise<void> {
  if (flag) {
    await a();
  } else {
    await b();
  }
}
`,
      'branchy',
    );

    expect(nodes).toHaveLength(1);
    const branch = nodes[0];
    if (branch?.type !== 'branch') throw new Error('Expected a branch node.');
    expect(branch.clauses[0]?.body.map((node) => node.type)).toEqual(['command']);
    expect(branch.otherwise?.map((node) => node.type)).toEqual(['command']);
  });

  it('preserves else-if ordering as a nested otherwise branch', async () => {
    const nodes = await bodyOf(
      `${header}
export async function ordered(flag: string): Promise<void> {
  if (flag === 'a') {
    await a();
  } else if (flag === 'b') {
    await b();
  } else {
    await a();
  }
}
`,
      'ordered',
    );

    const branch = nodes[0];
    if (branch?.type !== 'branch') throw new Error('Expected a branch node.');
    expect(branch.clauses).toHaveLength(1);
    const nested = branch.otherwise?.[0];
    if (nested?.type !== 'branch') throw new Error('Expected a nested otherwise branch.');
    expect(nested.clauses).toHaveLength(1);
    expect(nested.otherwise?.map((node) => node.type)).toEqual(['command']);
  });

  it('models an early return inside a branch as a terminal', async () => {
    const nodes = await bodyOf(
      `${header}
export async function earlyReturn(flag: boolean): Promise<void> {
  if (flag) {
    return;
  }
  await a();
}
`,
      'earlyReturn',
    );

    const branch = nodes.find((node) => node.type === 'branch');
    if (branch?.type !== 'branch') throw new Error('Expected a branch node.');
    expect(branch.clauses[0]?.body.some((node) => node.type === 'terminal')).toBe(true);
    expect(nodes.some((node) => node.type === 'command')).toBe(true);
  });

  it('models a while loop with a body', async () => {
    const nodes = await bodyOf(
      `${header}
export async function looping(done: boolean): Promise<void> {
  while (!done) {
    await a();
  }
}
`,
      'looping',
    );

    const loop = nodes.find((node) => node.type === 'loop');
    if (loop?.type !== 'loop') throw new Error('Expected a loop node.');
    expect(loop.loopKind).toBe('while');
    expect(loop.body.map((node) => node.type)).toEqual(['command']);
  });

  it('preserves labels on loops and break terminals', async () => {
    const nodes = await bodyOf(
      `${header}
export async function labeled(flag: boolean): Promise<void> {
  outer: while (flag) {
    switch (flag) {
      case true:
        break outer;
    }
  }
}
`,
      'labeled',
    );

    const loop = nodes[0];
    if (loop?.type !== 'loop') throw new Error('Expected a loop node.');
    const branch = loop.body[0];
    if (branch?.type !== 'branch') throw new Error('Expected a switch branch.');
    const terminal = branch.clauses[0]?.body[0];
    if (terminal?.type !== 'terminal') throw new Error('Expected a terminal node.');
    expect(loop.label).toBe('outer');
    expect(terminal.terminalKind).toBe('break');
    expect(terminal.label).toBe('outer');
  });

  it('preserves labels on non-loop regions', async () => {
    const nodes = await bodyOf(
      `${header}
export async function labeledSwitch(flag: boolean): Promise<void> {
  outer: switch (flag) {
    case true:
      break outer;
  }
  await a();
}
`,
      'labeledSwitch',
    );

    const region = nodes[0];
    if (region?.type !== 'region') throw new Error('Expected a labeled region node.');
    const branch = region.body[0];
    if (branch?.type !== 'branch') throw new Error('Expected a switch branch.');
    const terminal = branch.clauses[0]?.body[0];
    if (terminal?.type !== 'terminal') throw new Error('Expected a terminal node.');
    expect(region.label).toBe('outer');
    expect(terminal.terminalKind).toBe('break');
    expect(terminal.label).toBe('outer');
    expect(nodes.at(1)?.type).toBe('command');
  });

  it('models continueAsNew as a loop-back terminal, not normal completion', async () => {
    const nodes = await bodyOf(
      `${header}
export async function looper(i = 0): Promise<void> {
  await sleep('1s');
  await continueAsNew<typeof looper>(i + 1);
}
`,
      'looper',
    );

    const terminal = nodes.find((node) => node.type === 'terminal');
    if (terminal?.type !== 'terminal') throw new Error('Expected a terminal node.');
    expect(terminal.terminalKind).toBe('continue-as-new');
  });

  it('models try/catch as a try node', async () => {
    const nodes = await bodyOf(
      `${header}
export async function guarded(): Promise<void> {
  try {
    await a();
  } catch {
    await b();
  }
}
`,
      'guarded',
    );

    const tryNode = nodes.find((node) => node.type === 'try');
    if (tryNode?.type !== 'try') throw new Error('Expected a try node.');
    expect(tryNode.body.map((node) => node.type)).toEqual(['command']);
    expect(tryNode.handler?.body.map((node) => node.type)).toEqual(['command']);
  });

  it('models a fixed Promise.all as fixed parallelism', async () => {
    const nodes = await bodyOf(
      `${header}
export async function fixedParallel(): Promise<void> {
  await Promise.all([a(), b()]);
}
`,
      'fixedParallel',
    );

    const parallel = nodes.find((node) => node.type === 'parallel');
    if (parallel?.type !== 'parallel') throw new Error('Expected a parallel node.');
    expect(parallel.cardinality).toBe('fixed');
    // Regression: each bare-call array element (`a()`, `b()`) must yield a command
    // leaf. `getDescendantsOfKind` excludes the element itself, so before the
    // include-self fix these branches existed but were empty — an empty parallel box.
    expect(parallel.branches?.map((branch) => branch.map((node) => node.type))).toEqual([
      ['command'],
      ['command'],
    ]);
  });

  it('populates fixed Promise.race branches from bare-call elements', async () => {
    const nodes = await bodyOf(
      `${header}
export async function racing(): Promise<void> {
  await Promise.race([a(), b()]);
}
`,
      'racing',
    );

    const parallel = nodes.find((node) => node.type === 'parallel');
    if (parallel?.type !== 'parallel') throw new Error('Expected a parallel node.');
    expect(parallel.parallelKind).toBe('race');
    expect(parallel.cardinality).toBe('fixed');
    expect(parallel.branches?.map((branch) => branch.map((node) => node.type))).toEqual([
      ['command'],
      ['command'],
    ]);
  });

  it('populates ternary arms from bare calls', async () => {
    const nodes = await bodyOf(
      `${header}
export async function ternaryArms(flag: boolean): Promise<void> {
  await (flag ? a() : b());
}
`,
      'ternaryArms',
    );

    const branch = nodes.find((node) => node.type === 'branch');
    if (branch?.type !== 'branch') throw new Error('Expected a branch node.');
    expect(branch.branchKind).toBe('ternary');
    expect(branch.clauses[0]?.body.map((node) => node.type)).toEqual(['command']);
    expect(branch.otherwise?.map((node) => node.type)).toEqual(['command']);
  });

  it('models Promise.all over a map as a dynamic fan-out', async () => {
    const nodes = await bodyOf(
      `${header}
export async function fanOut(names: string[]): Promise<void> {
  await Promise.all(names.map((name) => executeChild(child, { args: [name] })));
}
`,
      'fanOut',
    );

    const parallel = nodes.find((node) => node.type === 'parallel');
    if (parallel?.type !== 'parallel') throw new Error('Expected a parallel node.');
    expect(parallel.cardinality).toBe('dynamic');
    expect(parallel.templateBranch?.some((node) => node.type === 'command')).toBe(true);
  });
});
