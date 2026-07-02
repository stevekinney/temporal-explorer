import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { Node, Project } from 'ts-morph';

import { analyzeProject, analyzeWorkflowFiles, loadTemporalExplorerProject } from './index';
import { getPackageManager, readPackageJson } from './package-metadata';
import { createSourceFileHashes, discoverFiles, toProjectPath } from './paths';
import { isNamedImportFrom } from './symbols';

async function createTemporaryAnalyzerProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-analyzer-'));
  await mkdir(join(root, 'src', 'activities'), { recursive: true });
  await mkdir(join(root, 'src', 'workflows'), { recursive: true });
  await Bun.write(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  await Bun.write(
    join(root, 'package.json'),
    JSON.stringify({
      packageManager: 'pnpm@9.0.0',
      dependencies: {
        '@temporalio/workflow': '^1.18.1',
        ignoredNumber: 1,
      },
      devDependencies: {
        typescript: '^6.0.0',
      },
    }),
  );
  await Bun.write(
    join(root, 'src', 'activities', 'coverage-activities.ts'),
    `
export async function knownActivity(): Promise<string> {
  return 'known';
}
`,
  );
  await Bun.write(
    join(root, 'src', 'workflows', 'coverage.workflow.ts'),
    `
import { proxyActivities } from '@temporalio/workflow';
import * as activities from '../activities/coverage-activities';

const activityProxy = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});
const unrelatedObject = {
  async knownActivity(): Promise<string> {
    return 'not a Temporal Activity proxy';
  },
};

export async function coverageWorkflow(input: string): Promise<string> {
  await unrelatedObject.knownActivity();
  await activityProxy.knownActivity();
  await activityProxy.missingActivity();
  await activityProxy['dynamicActivity']();
  return input;
}

function internalWorkflow(): Promise<string> {
  return activityProxy.knownActivity();
}
`,
  );
  await Bun.write(
    join(root, 'src', 'worker.ts'),
    `
import { Worker } from '@temporalio/worker';

export async function runWorker(): Promise<void> {
  await Worker.create({ workflowsPath: require.resolve('./workflows/coverage.workflow') });
}
`,
  );
  return root;
}

describe('basic static analyzer slice', () => {
  it('discovers the basic order workflow and direct Activity calls', async () => {
    const fixtureRoot = new URL('../../../fixtures/basic-order', import.meta.url).pathname;
    const project = await loadTemporalExplorerProject({
      root: fixtureRoot,
      workflowFiles: ['src/workflows/basic-order-workflow.ts'],
    });
    const analysis = await analyzeProject(project);

    expect(analysis.schemaVersion).toBe('temporal-analysis/v1');
    expect(analysis.workflows).toHaveLength(1);
    expect(analysis.workflows[0]?.name).toBe('basicOrderWorkflow');
    expect(analysis.workflows[0]?.signature.args[0]?.display).toBe('OrderInput');
    expect(analysis.workflows[0]?.temporalCommands.map((command) => command.name)).toEqual([
      'validateOrder',
      'chargeCard',
      'shipOrder',
    ]);
    expect(analysis.activities.map((activity) => activity.name)).toEqual([
      'validateOrder',
      'chargeCard',
      'shipOrder',
    ]);
    expect(analysis.diagnostics).toEqual([]);
  });

  it('handles dynamic Activity calls and inferred Activity implementations', async () => {
    const projectRoot = await createTemporaryAnalyzerProject();
    const analysis = await analyzeWorkflowFiles({
      projectRoot,
      tsconfig: 'tsconfig.json',
      workflowFiles: ['src/workflows/coverage.workflow.ts'],
      outputDirectory: '.temporal-explorer',
    });

    expect(analysis.project.packageManager).toBe('pnpm');
    expect(analysis.sdk.temporalTypeScriptVersion).toBe('^1.18.1');
    expect(analysis.workers).toHaveLength(1);
    expect(
      analysis.workflows[0]?.temporalCommands.map((command) => [command.kind, command.name]),
    ).toEqual([
      ['activity', 'knownActivity'],
      ['activity', 'missingActivity'],
      ['dynamic', "activityProxy['dynamicActivity']"],
    ]);
    expect(analysis.activities.map((activity) => activity.confidence)).toEqual([
      'exact',
      'inferred',
    ]);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code).toSorted()).toEqual([
      'TEA_DYNAMIC_ACTIVITY_CALL',
      'TEA_UNRESOLVED_ACTIVITY_IMPLEMENTATION',
    ]);
  });

  it('reads optional package metadata defensively', async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), 'temporal-explorer-empty-package-'));
    const primitiveRoot = await mkdtemp(join(tmpdir(), 'temporal-explorer-primitive-package-'));
    const nonRecordDependenciesRoot = await mkdtemp(
      join(tmpdir(), 'temporal-explorer-array-dependencies-'),
    );

    await Bun.write(join(primitiveRoot, 'package.json'), JSON.stringify('not an object'));
    await Bun.write(
      join(nonRecordDependenciesRoot, 'package.json'),
      JSON.stringify({
        dependencies: [],
      }),
    );

    expect(await readPackageJson(emptyRoot)).toEqual({});
    expect(await readPackageJson(primitiveRoot)).toEqual({});
    expect(await readPackageJson(nonRecordDependenciesRoot)).toEqual({});
    expect(getPackageManager({ packageManager: 'deno@2.0.0' })).toBeUndefined();
    expect(getPackageManager({ packageManager: 'yarn@4.0.0' })).toBe('yarn');
  });

  it('discovers source files and hashes them with project-relative keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-paths-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await Bun.write(join(root, 'src', 'b.ts'), 'export const b = 2;\n');
    await Bun.write(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    await Bun.write(join(root, 'src', 'ignored.test.ts'), 'export const ignored = true;\n');
    await Bun.write(join(root, 'src', 'ignored.spec.ts'), 'export const ignored = true;\n');

    const files = await discoverFiles(root, ['src/*.ts']);
    const hashes = await createSourceFileHashes(root, files);

    expect(files.map((file) => toProjectPath(root, file))).toEqual(['src/a.ts', 'src/b.ts']);
    expect(Object.keys(hashes)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('discovers signals, conditions, and handler registrations in the approval fixture', async () => {
    const fixtureRoot = new URL('../../../fixtures/approval', import.meta.url).pathname;
    const analysis = await analyzeProject(
      await loadTemporalExplorerProject({
        root: fixtureRoot,
        workflowFiles: ['src/workflows/approval-workflow.ts'],
      }),
    );
    const workflow = analysis.workflows[0];
    const signal = workflow?.messageSurface.signals[0];

    if (!workflow || !signal) {
      throw new Error('Expected the approval workflow and its signal to be discovered.');
    }

    expect(workflow.name).toBe('approvalWorkflow');
    expect(workflow.messageSurface.signals).toHaveLength(1);
    expect(signal.name).toBe('approve');
    expect(signal.args.map((arg) => arg.display)).toEqual(['ApprovalRecord']);
    expect(signal.handlerSource?.path).toBe('src/workflows/approval-workflow.ts');
    expect(workflow.temporalCommands.map((command) => [command.kind, command.staticOrder])).toEqual(
      [
        ['condition', 0],
        ['activity', 1],
      ],
    );
  });

  it('discovers condition timeouts as timer commands in the timer-race fixture', async () => {
    const fixtureRoot = new URL('../../../fixtures/timer-race', import.meta.url).pathname;
    const analysis = await analyzeProject(
      await loadTemporalExplorerProject({
        root: fixtureRoot,
        workflowFiles: ['src/workflows/timer-race-workflow.ts'],
      }),
    );
    const workflow = analysis.workflows[0];
    const commands = workflow?.temporalCommands ?? [];

    expect(commands.map((command) => command.kind)).toEqual([
      'condition',
      'timer',
      'activity',
      'activity',
    ]);
    expect(commands.find((command) => command.kind === 'timer')?.name).toBe("'30 days'");
    expect(workflow?.messageSurface.signals[0]?.args.map((arg) => arg.display)).toEqual(['string']);
  });

  it('discovers sleep calls and dynamic signal names defensively', async () => {
    const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-signals-'));
    await mkdir(join(root, 'src', 'workflows'), { recursive: true });
    await Bun.write(join(root, 'tsconfig.json'), JSON.stringify({ include: ['src/**/*.ts'] }));
    await Bun.write(
      join(root, 'src', 'workflows', 'sleepy.workflow.ts'),
      `
import { defineSignal, setHandler, sleep } from '@temporalio/workflow';

const signalName = 'runtime-named';
const dynamicSignal = defineSignal(signalName);
const bareSignal = defineSignal('bare');

export async function sleepyWorkflow(): Promise<void> {
  setHandler(dynamicSignal, () => {});
  setHandler(bareSignal, () => {});
  await sleep('5 minutes');
}
`,
    );

    const analysis = await analyzeWorkflowFiles({
      projectRoot: root,
      tsconfig: 'tsconfig.json',
      workflowFiles: ['src/workflows/sleepy.workflow.ts'],
      outputDirectory: '.temporal-explorer',
    });
    const workflow = analysis.workflows[0];
    const signals = workflow?.messageSurface.signals ?? [];

    expect(signals.map((signal) => [signal.name, signal.confidence])).toEqual([
      ['bare', 'exact'],
      ['signalName', 'dynamic'],
    ]);
    expect(signals.map((signal) => signal.args)).toEqual([[], []]);
    expect(workflow?.temporalCommands.map((command) => [command.kind, command.name])).toEqual([
      ['timer', "'5 minutes'"],
    ]);
  });

  it('returns false for identifiers without import declarations', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      '/source.ts',
      `
const Worker = {
  create() {}
};

    Worker.create();
`,
    );
    const identifier = sourceFile.getVariableDeclarationOrThrow('Worker').getNameNode();

    if (!Node.isIdentifier(identifier)) {
      throw new Error('Expected a Worker identifier.');
    }

    expect(isNamedImportFrom(identifier, '@temporalio/worker', 'Worker')).toBe(false);
  });
});
