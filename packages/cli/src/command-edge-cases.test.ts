import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  temporalExplorerArtifactVersions,
  validateArtifact,
  type TemporalAnalysisDocument,
} from '@temporal-explorer/api';
import { describe, expect, it } from 'bun:test';

import { formatShow } from './formatters';
import { main } from './index';
import { stableJson } from './json-format';

const fixtureRoot = new URL('../../../fixtures/basic-order', import.meta.url).pathname;
const analysisArtifactPath = `${fixtureRoot}/.temporal-explorer/analysis.json`;
const historyPath = `${fixtureRoot}/histories/success.json`;
const traceArtifactPath = `${fixtureRoot}/.temporal-explorer/histories/success.trace.json`;
const overlayArtifactPath = `${fixtureRoot}/.temporal-explorer/overlays/success.overlay.json`;

type CommandRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTemporalAnalysisDocument(value: unknown): value is TemporalAnalysisDocument {
  return (
    isRecord(value) &&
    value['schemaVersion'] === temporalExplorerArtifactVersions.analysis &&
    Array.isArray(value['workflows'])
  );
}

async function runCommand(args: string[], isInteractive = false): Promise<CommandRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await main(args, {
    stdout: (text) => {
      stdout.push(text);
    },
    stderr: (text) => {
      stderr.push(text);
    },
    isInteractive,
  });

  return {
    exitCode,
    stdout: stdout.join(''),
    stderr: stderr.join(''),
  };
}

async function createMinimalProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-cli-project-'));
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
    join(root, 'src', 'workflows', 'empty.workflow.ts'),
    `
export async function emptyWorkflow(): Promise<void> {}
`,
  );
  return root;
}

async function createProjectWithRuntimeArtifacts(): Promise<string> {
  const root = await createMinimalProject();
  const historiesDirectory = join(root, '.temporal-explorer', 'histories');
  const overlaysDirectory = join(root, '.temporal-explorer', 'overlays');
  const traceArtifact = JSON.stringify(await Bun.file(traceArtifactPath).json());
  const overlayArtifact = JSON.stringify(await Bun.file(overlayArtifactPath).json());

  await mkdir(historiesDirectory, { recursive: true });
  await mkdir(overlaysDirectory, { recursive: true });
  await Bun.write(join(historiesDirectory, 'b.trace.json'), traceArtifact);
  await Bun.write(join(historiesDirectory, 'a.trace.json'), traceArtifact);
  await Bun.write(join(overlaysDirectory, 'b.overlay.json'), overlayArtifact);
  await Bun.write(join(overlaysDirectory, 'a.overlay.json'), overlayArtifact);

  return root;
}

async function readAnalysisArtifact(): Promise<TemporalAnalysisDocument> {
  const artifact = await Bun.file(analysisArtifactPath).json();
  const validation = validateArtifact(artifact);

  if (!validation.success || !isTemporalAnalysisDocument(validation.value)) {
    throw new Error('Expected a valid Temporal Explorer analysis artifact.');
  }

  return validation.value;
}

describe('temporal-explorer command edge cases', () => {
  it('handles global and unimplemented commands', async () => {
    const helpRun = await runCommand([]);
    const versionRun = await runCommand(['--version']);
    const unknownRun = await runCommand(['unknown']);

    expect(helpRun.exitCode).toBe(0);
    expect(helpRun.stdout).toContain('Temporal Workflow Explorer');
    expect(versionRun).toEqual({
      exitCode: 0,
      stdout: '0.0.0-mvp\n',
      stderr: '',
    });
    expect(unknownRun.exitCode).toBe(1);
    expect(unknownRun.stderr).toContain(
      'Command "unknown" is not implemented in the current MVP slice.',
    );
  });

  it('uses the default command environment when none is provided', async () => {
    expect(await main(['--version'])).toBe(0);
    expect(await main(['unknown-default-environment'])).toBe(1);
  });

  it('prints the non-JSON analyze summary', async () => {
    const analyzeRun = await runCommand(['analyze', '--project', fixtureRoot]);

    expect(analyzeRun.exitCode).toBe(0);
    expect(analyzeRun.stdout).toContain('Analyzed 1 workflow(s)');
  });

  it('prints the list JSON variant', async () => {
    const listRun = await runCommand(['list', '--project', fixtureRoot, '--json']);

    expect(JSON.parse(listRun.stdout)).toHaveLength(1);
  });

  it('prints the missing-show JSON variant', async () => {
    const showMissingRun = await runCommand([
      'show',
      'missingWorkflow',
      '--project',
      fixtureRoot,
      '--json',
    ]);

    expect(showMissingRun.exitCode).toBe(1);
    expect(showMissingRun.stdout).toBe('null\n');
  });

  it('prints history and trace JSON variants', async () => {
    const historyJsonRun = await runCommand([
      'history',
      'import',
      '--project',
      fixtureRoot,
      '--file',
      historyPath,
      '--json',
    ]);
    const traceJsonRun = await runCommand([
      'trace',
      'basicOrderWorkflow',
      '--project',
      fixtureRoot,
      '--history',
      'success',
      '--json',
    ]);

    expect(JSON.parse(historyJsonRun.stdout).schemaVersion).toBe('temporal-trace/v1');
    expect(JSON.parse(traceJsonRun.stdout).schemaVersion).toBe('temporal-overlay/v1');
  });

  it('reports command argument errors without throwing to callers', async () => {
    const runs = await Promise.all([
      runCommand(['analyze', '--project']),
      runCommand(['show', '--project', fixtureRoot]),
      runCommand(['history', 'delete']),
      runCommand(['history', 'import', '--project', fixtureRoot]),
      runCommand(['trace', '--project', fixtureRoot]),
      runCommand(['trace', 'basicOrderWorkflow', '--project', fixtureRoot]),
      runCommand(['report', '--project', fixtureRoot]),
      runCommand(['render', '--project', fixtureRoot]),
      runCommand(['render', 'basicOrderWorkflow', '--project', fixtureRoot, '--format', 'json']),
      runCommand(['open', '--project', fixtureRoot, '--port', 'not-a-number']),
      runCommand(['open', '--project', fixtureRoot, '--port', '70000']),
    ]);

    expect(runs.map((run) => run.exitCode)).toEqual(Array.from({ length: runs.length }, () => 1));
    expect(runs.map((run) => run.stderr)).toEqual([
      '--project requires a path.\n',
      'show requires a Workflow name.\n',
      'history requires the import subcommand in the current MVP slice.\n',
      'history import requires --file.\n',
      'trace requires a Workflow name.\n',
      'trace requires --history.\n',
      'report requires --trace.\n',
      'render requires a Workflow name.\n',
      'render currently supports --format mermaid.\n',
      'Invalid --port value: not-a-number.\n',
      'Invalid port: 70000.\n',
    ]);
  });

  it('formats Workflows with empty Activities and diagnostics', async () => {
    const analysisWithEmptyWorkflow = structuredClone(await readAnalysisArtifact());
    const workflow = analysisWithEmptyWorkflow.workflows[0];

    if (!workflow) {
      throw new Error('Expected a Workflow fixture.');
    }

    workflow.temporalCommands = [];
    workflow.diagnostics.push({
      code: 'TEA_DYNAMIC_ACTIVITY_CALL',
      category: 'control-flow',
      severity: 'warning',
      message: 'Dynamic Activity call could not be resolved.',
      confidence: 'dynamic',
    });

    expect(formatShow(analysisWithEmptyWorkflow, 'basicOrderWorkflow')).toContain('  none');
    expect(formatShow(analysisWithEmptyWorkflow, 'basicOrderWorkflow')).toContain(
      'warning TEA_DYNAMIC_ACTIVITY_CALL: Dynamic Activity call could not be resolved.',
    );
    expect(() => formatShow(analysisWithEmptyWorkflow, 'missingWorkflow')).toThrow(
      'Workflow "missingWorkflow" was not found.',
    );
  });

  it('formats long arrays across multiple JSON lines', () => {
    expect(stableJson(['x'.repeat(120)])).toBe(`[\n  "${'x'.repeat(120)}"\n]\n`);
  });

  it('generates docs when trace and overlay artifact directories are absent', async () => {
    const projectRoot = await createMinimalProject();
    const result = await runCommand(['docs', '--project', projectRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Generated 3 documentation file(s).');
  });

  it('generates docs with multiple sorted runtime artifacts', async () => {
    const projectRoot = await createProjectWithRuntimeArtifacts();
    const result = await runCommand(['docs', '--project', projectRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Generated 3 documentation file(s).');
  });
});
