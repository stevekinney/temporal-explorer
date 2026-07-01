import { describe, expect, it } from 'bun:test';

import { createHelpText, main } from './index';

const fixtureRoot = new URL('../../../fixtures/basic-order', import.meta.url).pathname;
const historyPath = `${fixtureRoot}/histories/success.json`;

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
