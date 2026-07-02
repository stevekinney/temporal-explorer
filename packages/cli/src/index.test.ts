import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'bun:test';

import { createHelpText, main } from './index';

const committedFixturesRoot = new URL('../../../fixtures/', import.meta.url).pathname;

/**
 * CLI commands write artifacts into their project directory, so every test
 * runs against a temporary copy of the committed fixture. Committed artifacts
 * are only refreshed by `bun run fixtures:regenerate-artifacts`.
 */
async function copyFixture(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `temporal-explorer-cli-${name}-`));
  await cp(join(committedFixturesRoot, name), root, { recursive: true });
  return root;
}

let fixtureRoot = '';
let historyPath = '';

beforeAll(async () => {
  fixtureRoot = await copyFixture('basic-order');
  historyPath = join(fixtureRoot, 'histories', 'success.json');
});

type AnalysisJson = {
  workflows: { name: string; temporalCommands: { name: string }[] }[];
};

type CommandRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAnalysisJson(value: unknown): value is AnalysisJson {
  return isRecord(value) && Array.isArray(value['workflows']);
}

function parseAnalysisJson(text: string): AnalysisJson {
  const value: unknown = JSON.parse(text);

  if (!isAnalysisJson(value)) {
    throw new Error('Expected Temporal Explorer analysis JSON.');
  }

  return value;
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

describe('temporal-explorer CLI scaffold', () => {
  it('prints help text for the product binary', () => {
    expect(createHelpText()).toContain('Usage: temporal-explorer <command>');
    expect(createHelpText()).toContain('analyze');
    expect(createHelpText()).toContain('open');
  });

  it('returns success for --help', async () => {
    const run = await runCommand(['--help']);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('Temporal Workflow Explorer');
  });

  it('checks a clean fixture and exits successfully', async () => {
    const run = await runCommand(['check', '--project', fixtureRoot]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('Analysis passed with 0 warning(s).');
  });

  it('reports check diagnostics as JSON', async () => {
    const run = await runCommand(['check', '--project', fixtureRoot, '--json']);
    const parsed: unknown = JSON.parse(run.stdout);

    expect(run.exitCode).toBe(0);
    expect(isRecord(parsed) && parsed['errorCount']).toBe(0);
    expect(isRecord(parsed) && Array.isArray(parsed['diagnostics'])).toBe(true);
  });

  it('explains project detection and artifact freshness through doctor', async () => {
    const run = await runCommand(['doctor', '--project', fixtureRoot]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('configuration: defaults');
    expect(run.stdout).toContain('Analysis artifact: fresh');
    expect(run.stdout).toContain(
      'src/workflows/basic-order-workflow.ts (matched default workflow globs)',
    );

    const jsonRun = await runCommand(['doctor', '--project', fixtureRoot, '--json']);
    const parsed: unknown = JSON.parse(jsonRun.stdout);
    expect(isRecord(parsed) && parsed['analysisArtifact']).toBe('fresh');
  });

  it('applies configured diagnostic severities to check', async () => {
    const { mkdtemp, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const workflowSource = `
import { proxyActivities } from '@temporalio/workflow';

const activities = proxyActivities<Record<string, () => Promise<string>>>({
  startToCloseTimeout: '1 minute',
});

export async function configuredWorkflow(step: string): Promise<string> {
  return await activities[step]();
}
`;

    const createProject = async (severity: string): Promise<string> => {
      const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-check-config-'));
      await mkdir(join(root, 'src', 'workflows'), { recursive: true });
      await Bun.write(join(root, 'tsconfig.json'), JSON.stringify({ include: ['src/**/*.ts'] }));
      await Bun.write(join(root, 'src', 'workflows', 'configured.workflow.ts'), workflowSource);
      await Bun.write(
        join(root, 'temporal-explorer.config.ts'),
        `const configuration = { diagnostics: { TEA_DYNAMIC_ACTIVITY_CALL: '${severity}' } };\nexport default configuration;\n`,
      );
      return root;
    };

    const escalated = await runCommand(['check', '--project', await createProject('error')]);
    expect(escalated.exitCode).toBe(1);
    expect(escalated.stdout).toContain('Analysis failed with 1 error(s)');

    const suppressed = await runCommand(['check', '--project', await createProject('off')]);
    expect(suppressed.exitCode).toBe(0);
    expect(suppressed.stdout).toContain('Analysis passed with 0 warning(s)');
  });

  it('warns before writing decoded payload previews and applies key redaction', async () => {
    const { mkdtemp, mkdir, copyFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-payload-config-'));
    await mkdir(join(root, 'histories'), { recursive: true });
    await Bun.write(join(root, 'tsconfig.json'), JSON.stringify({ include: ['src/**/*.ts'] }));
    await copyFile(historyPath, join(root, 'histories', 'success.json'));
    await Bun.write(
      join(root, 'temporal-explorer.config.ts'),
      `const configuration = {
  history: { payloads: { decode: true, redact: ['paymentToken'], maxPreviewBytes: 4096 } },
};
export default configuration;
`,
    );

    const run = await runCommand([
      'history',
      'import',
      '--project',
      root,
      '--file',
      join(root, 'histories', 'success.json'),
      '--json',
    ]);

    expect(run.exitCode).toBe(0);
    expect(run.stderr).toContain('Warning: decoded payload previews will be written');

    const trace: unknown = JSON.parse(run.stdout);
    const payloads = isRecord(trace) && Array.isArray(trace['payloads']) ? trace['payloads'] : [];
    const decodedInput = payloads.find(
      (payload) => isRecord(payload) && payload['kind'] === 'input' && payload['decoded'] === true,
    );

    expect(isRecord(decodedInput)).toBe(true);
    expect(JSON.stringify(decodedInput)).toContain('[REDACTED]');
    expect(JSON.stringify(decodedInput)).not.toContain('payment-token-redacted');
  });

  it('proves every determinism diagnostic at its source location', async () => {
    const diagnosticsRoot = await copyFixture('diagnostics');
    const run = await runCommand(['check', '--project', diagnosticsRoot]);

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain(
      'error src/workflows/unsafe-workflow.ts:6\nTEA_UNSAFE_WORKFLOW_IMPORT',
    );
    expect(run.stdout).toContain(
      'error src/workflows/unsafe-workflow.ts:11\nTEA_DUPLICATE_MESSAGE_NAME',
    );
    expect(run.stdout).toContain(
      'warning src/workflows/unsafe-workflow.ts:37\nTEA_UNRESOLVED_ACTIVITY_IMPLEMENTATION',
    );
    expect(run.stdout).toContain(
      'error src/workflows/unsafe-workflow.ts:26\nTEA_QUERY_STATE_MUTATION',
    );
    expect(run.stdout).toContain(
      'error src/workflows/unsafe-workflow.ts:33\nTEA_NONDETERMINISTIC_API: Potential nondeterministic API inside Workflow: Date.now()',
    );
    expect(run.stdout).toContain('Analysis failed with 7 error(s) and 1 warning(s).');
  });

  it('fails check with a non-zero exit for query handler violations', async () => {
    const queryRoot = await copyFixture('query');
    const run = await runCommand(['check', '--project', queryRoot]);

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain('TEA_QUERY_STATE_MUTATION');
    expect(run.stdout).toContain('Analysis failed with 1 error(s)');
  });

  it('shows queries, updates, and operations for construct fixtures', async () => {
    const queryRoot = await copyFixture('query');
    const queryRun = await runCommand(['show', 'queryWorkflow', '--project', queryRoot]);

    expect(queryRun.stdout).toContain('Query status(): OrderStatus');
    expect(queryRun.stdout).toContain('Query auditCount(string): number');

    const childRoot = await copyFixture('child-workflow');
    const childRun = await runCommand(['show', 'childWorkflowParent', '--project', childRoot]);

    expect(childRun.stdout).toContain('child-workflow reserveInventoryChild');
    expect(childRun.stdout).toContain('child-workflow releaseNotificationChild');
  });

  it('lists signals and waits for the approval fixture', async () => {
    const approvalRoot = await copyFixture('approval');
    const run = await runCommand(['show', 'approvalWorkflow', '--project', approvalRoot]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('Signal approve(ApprovalRecord)');
    expect(run.stdout).toContain('condition () => approval !== undefined');
  });

  it('analyzes the basic order fixture as JSON', async () => {
    const run = await runCommand(['analyze', '--project', fixtureRoot, '--json']);
    const analysis = parseAnalysisJson(run.stdout);

    expect(run.exitCode).toBe(0);
    expect(analysis.workflows[0]?.name).toBe('basicOrderWorkflow');
    expect(analysis.workflows[0]?.temporalCommands.map((command) => command.name)).toEqual([
      'validateOrder',
      'chargeCard',
      'shipOrder',
    ]);
  });

  it('lists the basic order workflow', async () => {
    const run = await runCommand(['list', '--project', fixtureRoot]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('basicOrderWorkflow');
    expect(run.stdout).toContain('validateOrder, chargeCard, shipOrder');
  });

  it('shows the basic order workflow', async () => {
    const run = await runCommand(['show', 'basicOrderWorkflow', '--project', fixtureRoot]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('basicOrderWorkflow(input: OrderInput): Promise<OrderResult>');
    expect(run.stdout).toContain('shipOrder');
  });

  it('imports the basic order history fixture', async () => {
    const run = await runCommand([
      'history',
      'import',
      '--project',
      fixtureRoot,
      '--file',
      historyPath,
    ]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('Imported 23 history event(s)');
    expect(run.stdout).toContain('success.trace.json');
  });

  it('maps and reports the basic order overlay fixture', async () => {
    const traceRun = await runCommand([
      'trace',
      'basicOrderWorkflow',
      '--project',
      fixtureRoot,
      '--history',
      'success',
    ]);
    const reportRun = await runCommand(['report', '--project', fixtureRoot, '--trace', 'success']);

    expect(traceRun.exitCode).toBe(0);
    expect(traceRun.stdout).toContain('0 unmapped');
    expect(traceRun.stdout).toContain('success.overlay.json');
    expect(reportRun.exitCode).toBe(0);
    expect(reportRun.stdout).toContain(
      'validateOrder (observed) -> src/workflows/basic-order-workflow.ts:17 [exact]',
    );
  });

  it('generates deterministic documentation for the basic order fixture', async () => {
    const run = await runCommand(['docs', '--project', fixtureRoot]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('Generated 3 documentation file(s).');
  });

  it('renders the basic order workflow as Mermaid', async () => {
    const run = await runCommand([
      'render',
      'basicOrderWorkflow',
      '--project',
      fixtureRoot,
      '--format',
      'mermaid',
    ]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('flowchart TD');
    expect(run.stdout).toContain('start --> activity_call_basicOrderWorkflow_validateOrder_0');
  });

  it('opens the explorer in non-interactive verification mode', async () => {
    const run = await runCommand(['open', '--project', fixtureRoot]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('Temporal Explorer available at http://127.0.0.1:');
    expect(run.stdout).toContain('Verified local explorer server startup and shutdown.');
  });

  it('opens the explorer with a requested trace query', async () => {
    const run = await runCommand(['open', '--project', fixtureRoot, '--trace', 'success']);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('?trace=success');
  });
});
