import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

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

const activities = `export async function a(): Promise<void> {}
export async function b(): Promise<void> {}
`;

/** Writes flat `src/*.ts` files, analyzes the given Workflow file, returns `kind:name` command strings. */
async function commandsOf(
  files: Record<string, string>,
  workflowFile: string,
  workflowName: string,
): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-ipc-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await Bun.write(join(root, 'tsconfig.json'), tsconfig);
  await Bun.write(join(root, 'src', 'activities.ts'), activities);

  for (const [name, contents] of Object.entries(files)) {
    await Bun.write(join(root, 'src', name), contents);
  }

  const analysis = await analyzeWorkflowFiles({
    projectRoot: root,
    tsconfig: 'tsconfig.json',
    workflowFiles: [`src/${workflowFile}`],
  });
  const workflow = analysis.workflows.find((candidate) => candidate.name === workflowName);

  if (!workflow) {
    throw new Error(`Expected the ${workflowName} workflow.`);
  }

  return workflow.temporalCommands.map((command) => `${command.kind}:${command.name}`);
}

describe('interprocedural command collection', () => {
  it('collects commands from a module-local helper the Workflow calls', async () => {
    const commands = await commandsOf(
      {
        'workflows.ts': `import { proxyActivities, sleep } from '@temporalio/workflow';
import type * as activities from './activities';
const { a } = proxyActivities<typeof activities>({ startToCloseTimeout: '1m' });

async function step(): Promise<void> {
  await a();
  await sleep('1m');
}

export async function helperWorkflow(): Promise<void> {
  await step();
}
`,
      },
      'workflows.ts',
      'helperWorkflow',
    );

    expect(commands).toContain('activity:a');
    expect(commands.some((command) => command.startsWith('timer:'))).toBe(true);
    expect(commands).toHaveLength(2);
  });

  it('walks a recursive helper only one level deep', async () => {
    const commands = await commandsOf(
      {
        'workflows.ts': `import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
const { a } = proxyActivities<typeof activities>({ startToCloseTimeout: '1m' });

async function loop(n: number): Promise<void> {
  await a();
  if (n > 0) {
    await loop(n - 1);
  }
}

export async function recursiveWorkflow(): Promise<void> {
  await loop(3);
}
`,
      },
      'workflows.ts',
      'recursiveWorkflow',
    );

    // The self-call at depth 1 is not re-entered, so the Activity is collected once.
    expect(commands).toEqual(['activity:a']);
  });

  it('collects commands from a cross-file helper function', async () => {
    const commands = await commandsOf(
      {
        'steps.ts': `import { executeChild, sleep } from '@temporalio/workflow';

export async function runSteps(): Promise<void> {
  await executeChild('someChild');
  await sleep('5m');
}
`,
        'workflows.ts': `import { runSteps } from './steps';

export async function orchestrator(): Promise<void> {
  await runSteps();
}
`,
      },
      'workflows.ts',
      'orchestrator',
    );

    expect(commands).toContain('child-workflow:someChild');
    expect(commands.some((command) => command.startsWith('timer:'))).toBe(true);
  });

  it('collects commands from a cross-file class method the Workflow calls', async () => {
    const commands = await commandsOf(
      {
        'manager.ts': `import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
const { b } = proxyActivities<typeof activities>({ startToCloseTimeout: '1m' });

export class Manager {
  async start(): Promise<void> {
    await b();
  }
}
`,
        'workflows.ts': `import { Manager } from './manager';

export async function managerWorkflow(): Promise<void> {
  const manager = new Manager();
  await manager.start();
}
`,
      },
      'workflows.ts',
      'managerWorkflow',
    );

    expect(commands).toEqual(['activity:b']);
  });

  it('does not double-count a nested helper already walked by the Workflow body', async () => {
    const commands = await commandsOf(
      {
        'workflows.ts': `import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
const { a } = proxyActivities<typeof activities>({ startToCloseTimeout: '1m' });

export async function nestedWorkflow(): Promise<void> {
  async function inner(): Promise<void> {
    await a();
  }
  await inner();
}
`,
      },
      'workflows.ts',
      'nestedWorkflow',
    );

    // inner() resolves to a declaration inside the Workflow body, which the main walk already covers.
    expect(commands).toEqual(['activity:a']);
  });

  it('does not descend into helpers defined in non-Workflow modules', async () => {
    const commands = await commandsOf(
      {
        'utils.ts': `export function computeTotal(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
`,
        'workflows.ts': `import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import { computeTotal } from './utils';
const { a } = proxyActivities<typeof activities>({ startToCloseTimeout: '1m' });

export async function pureWorkflow(): Promise<void> {
  computeTotal([1, 2, 3]);
  await a();
}
`,
      },
      'workflows.ts',
      'pureWorkflow',
    );

    // utils.ts has no @temporalio/workflow import, so it is treated as a non-Workflow module.
    expect(commands).toEqual(['activity:a']);
  });

  it('collects an external-workflow signal sent from inside a helper', async () => {
    const commands = await commandsOf(
      {
        'workflows.ts': `import { getExternalWorkflowHandle } from '@temporalio/workflow';

async function notifyParent(id: string): Promise<void> {
  const handle = getExternalWorkflowHandle(id);
  await handle.signal('childDone');
}

export async function signalWorkflow(id: string): Promise<void> {
  await notifyParent(id);
}
`,
      },
      'workflows.ts',
      'signalWorkflow',
    );

    expect(commands).toEqual(['external-workflow:childDone']);
  });

  it('collects a Nexus operation invoked from inside a helper', async () => {
    const commands = await commandsOf(
      {
        'workflows.ts': `import { createNexusServiceClient } from '@temporalio/workflow';

async function callNexus(): Promise<void> {
  const client = createNexusServiceClient({} as never);
  await client.executeOperation('op', {});
}

export async function nexusWorkflow(): Promise<void> {
  await callNexus();
}
`,
      },
      'workflows.ts',
      'nexusWorkflow',
    );

    expect(commands).toEqual(['nexus-operation:op']);
  });

  it('does not fabricate an Activity from a helper parameter that shadows a proxy variable name', async () => {
    const commands = await commandsOf(
      {
        'workflows.ts': `import { proxyActivities } from '@temporalio/workflow';
import type * as activityTypes from './activities';
const activities = proxyActivities<typeof activityTypes>({ startToCloseTimeout: '1m' });

function summarize(activities: string[]): number {
  activities.push('z');
  return activities.length;
}

export async function shadowWorkflow(): Promise<void> {
  await activities.a();
  summarize(['x', 'y']);
}
`,
      },
      'workflows.ts',
      'shadowWorkflow',
    );

    // summarize's `activities` parameter shadows the proxy, so `activities.push` is not a command.
    expect(commands).toEqual(['activity:a']);
  });
});
