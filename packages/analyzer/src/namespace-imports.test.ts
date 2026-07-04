import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

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

async function analyzeNamespaceWorkflow(source: string) {
  const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-namespace-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await Bun.write(join(root, 'tsconfig.json'), tsconfig);
  await Bun.write(
    join(root, 'src', 'activities.ts'),
    `export async function greet(name: string): Promise<string> {
  return name;
}
`,
  );
  await Bun.write(join(root, 'src', 'workflows.ts'), source);

  const analysis = await analyzeWorkflowFiles({
    projectRoot: root,
    tsconfig: 'tsconfig.json',
    workflowFiles: ['src/workflows.ts'],
  });

  return analysis;
}

describe('namespace import detection (import * as wf)', () => {
  it('detects activities, timers, conditions, and messages through a namespace import', async () => {
    const analysis = await analyzeNamespaceWorkflow(
      `import * as wf from '@temporalio/workflow';
import type * as activities from './activities';

const { greet } = wf.proxyActivities<typeof activities>({ startToCloseTimeout: '1 minute' });
const ready = wf.defineSignal('ready');
const status = wf.defineQuery<string>('status');
const setName = wf.defineUpdate<void, [string]>('setName');

export async function example(): Promise<string> {
  let isReady = false;
  wf.setHandler(ready, () => {
    isReady = true;
  });
  wf.setHandler(status, () => 'ok');
  wf.setHandler(setName, (name: string) => {
    void name;
  });
  await wf.condition(() => isReady);
  await wf.sleep('1s');
  return await greet('hi');
}
`,
    );

    const workflow = analysis.workflows.find((candidate) => candidate.name === 'example');

    if (!workflow) {
      throw new Error('Expected the example workflow to be discovered.');
    }

    const kinds = workflow.temporalCommands.map((command) => command.kind);
    expect(kinds).toContain('activity');
    expect(kinds).toContain('timer');
    expect(kinds).toContain('condition');
    expect(workflow.temporalCommands.some((c) => c.kind === 'activity' && c.name === 'greet')).toBe(
      true,
    );

    expect(workflow.messageSurface.signals.map((signal) => signal.name)).toEqual(['ready']);
    expect(workflow.messageSurface.queries.map((query) => query.name)).toEqual(['status']);
    expect(workflow.messageSurface.updates.map((update) => update.name)).toEqual(['setName']);
  });

  it('detects child workflows, continueAsNew, patch, and cancellation scopes through a namespace import', async () => {
    const analysis = await analyzeNamespaceWorkflow(
      `import * as wf from '@temporalio/workflow';

export async function childWorkflow(name: string): Promise<string> {
  return name;
}

export async function looper(iteration = 0): Promise<void> {
  if (wf.patched('v2')) {
    void 0;
  }
  await wf.executeChild(childWorkflow, { args: ['a'] });
  await wf.CancellationScope.cancellable(async () => {
    await wf.sleep('2s');
  });
  await wf.continueAsNew<typeof looper>(iteration + 1);
}
`,
    );

    const looper = analysis.workflows.find((candidate) => candidate.name === 'looper');

    if (!looper) {
      throw new Error('Expected the looper workflow to be discovered.');
    }

    const kinds = looper.temporalCommands.map((command) => command.kind);
    expect(kinds).toContain('patch');
    expect(kinds).toContain('child-workflow');
    expect(kinds).toContain('cancellation-scope');
    expect(kinds).toContain('continue-as-new');
    expect(kinds).toContain('timer');
  });

  it('detects upsertSearchAttributes and upsertMemo as search-attribute commands', async () => {
    const analysis = await analyzeNamespaceWorkflow(
      `import { upsertSearchAttributes, upsertMemo } from '@temporalio/workflow';

export async function tagged(): Promise<void> {
  upsertSearchAttributes({ CustomKeywordField: ['value'] });
  upsertMemo({ note: 'hello' });
}
`,
    );

    const tagged = analysis.workflows.find((candidate) => candidate.name === 'tagged');

    if (!tagged) {
      throw new Error('Expected the tagged workflow to be discovered.');
    }

    expect(
      tagged.temporalCommands
        .filter((command) => command.kind === 'search-attribute')
        .map((command) => command.name),
    ).toEqual(['upsertSearchAttributes', 'upsertMemo']);
  });

  it('detects Nexus operations invoked on a createNexusServiceClient handle', async () => {
    const analysis = await analyzeNamespaceWorkflow(
      `import * as wf from '@temporalio/workflow';

export async function caller(message: string): Promise<string> {
  const nexusClient = wf.createNexusServiceClient({ service: 'hello', endpoint: 'e' });
  return await nexusClient.executeOperation('echo', { message });
}
`,
    );

    const caller = analysis.workflows.find((candidate) => candidate.name === 'caller');

    if (!caller) {
      throw new Error('Expected the caller workflow to be discovered.');
    }

    expect(
      caller.temporalCommands
        .filter((command) => command.kind === 'nexus-operation')
        .map((command) => command.name),
    ).toEqual(['echo']);
  });
});

async function analyzeProject(files: Record<string, string>, workflowFiles: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-messages-'));
  await Bun.write(join(root, 'tsconfig.json'), tsconfig);

  for (const [relativePath, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, relativePath)), { recursive: true });
    await Bun.write(join(root, relativePath), content);
  }

  return analyzeWorkflowFiles({ projectRoot: root, tsconfig: 'tsconfig.json', workflowFiles });
}

describe('cross-file and inline message definitions', () => {
  it('resolves an update defined in another module and registered by identifier', async () => {
    const analysis = await analyzeProject(
      {
        'src/shared.ts': `import { defineUpdate } from '@temporalio/workflow';

export const getConfirmation = defineUpdate<string, []>('get-confirmation');
`,
        'src/workflows.ts': `import * as wf from '@temporalio/workflow';
import { getConfirmation } from './shared';

export async function transaction(): Promise<void> {
  let confirmed = false;
  wf.setHandler(getConfirmation, async () => {
    confirmed = true;
    return 'ok';
  });
  await wf.condition(() => confirmed);
}
`,
      },
      ['src/workflows.ts'],
    );

    const workflow = analysis.workflows.find((candidate) => candidate.name === 'transaction');

    if (!workflow) {
      throw new Error('Expected the transaction workflow to be discovered.');
    }

    expect(workflow.messageSurface.updates.map((update) => update.name)).toEqual([
      'get-confirmation',
    ]);
  });

  it('resolves a query defined inline inside setHandler', async () => {
    const analysis = await analyzeProject(
      {
        'src/workflows.ts': `import { setHandler, defineQuery, condition } from '@temporalio/workflow';

export async function subscriber(): Promise<void> {
  let value = 0;
  setHandler(defineQuery<number>('getValue'), () => value);
  await condition(() => value > 0);
}
`,
      },
      ['src/workflows.ts'],
    );

    const workflow = analysis.workflows.find((candidate) => candidate.name === 'subscriber');

    if (!workflow) {
      throw new Error('Expected the subscriber workflow to be discovered.');
    }

    expect(workflow.messageSurface.queries.map((query) => query.name)).toEqual(['getValue']);
  });

  it('resolves a signal defined inline inside setHandler', async () => {
    const analysis = await analyzeProject(
      {
        'src/workflows.ts': `import { setHandler, defineSignal, condition } from '@temporalio/workflow';

export async function waiter(): Promise<void> {
  let done = false;
  setHandler(defineSignal('finish'), () => {
    done = true;
  });
  await condition(() => done);
}
`,
      },
      ['src/workflows.ts'],
    );

    const workflow = analysis.workflows.find((candidate) => candidate.name === 'waiter');

    if (!workflow) {
      throw new Error('Expected the waiter workflow to be discovered.');
    }

    expect(workflow.messageSurface.signals.map((signal) => signal.name)).toEqual(['finish']);
  });
});
