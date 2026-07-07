import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { describe, expect, it } from 'bun:test';

import { main } from './index';

// Minimal implementations matching the basic-order workflow's proxy names;
// the fixture package sits outside this package's rootDir.
const activities = {
  async validateOrder(input: { orderId: string }) {
    return { orderId: input.orderId, totalCents: 4200 };
  },
  async chargeCard(order: { orderId: string }) {
    return { authorizationId: `authorization-${order.orderId}` };
  },
  async shipOrder(order: { orderId: string }) {
    return { trackingNumber: `tracking-${order.orderId}` };
  },
};

const committedFixture = new URL('../../../fixtures/basic-order', import.meta.url).pathname;
const workflowsPath = join(committedFixture, 'src', 'workflows', 'basic-order-workflow.ts');

type ImportedTrace = {
  execution: { status: string };
  payloads: { decoded: boolean; redacted: boolean }[];
};

function isImportedTrace(value: unknown): value is ImportedTrace {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const execution: unknown = Reflect.get(value, 'execution');
  const payloads: unknown = Reflect.get(value, 'payloads');

  if (typeof execution !== 'object' || execution === null || !Array.isArray(payloads)) {
    return false;
  }

  return typeof Reflect.get(execution, 'status') === 'string';
}

async function runCommand(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await main(args, {
    stdout: (text) => {
      stdout.push(text);
    },
    stderr: (text) => {
      stderr.push(text);
    },
    isInteractive: false,
  });

  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

// Live integration tests start a real Temporal dev server; they run through
// `bun run test:live` (see the matching note in packages/history).
const liveTestsEnabled = Bun.env['TEMPORAL_EXPLORER_LIVE_TESTS'] === '1';

describe.skipIf(!liveTestsEnabled)('temporal-explorer live commands', () => {
  it('rejects unknown connection profiles with available names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-live-config-'));
    await Bun.write(join(root, 'tsconfig.json'), JSON.stringify({ include: ['src/**/*.ts'] }));
    await Bun.write(
      join(root, 'temporal-explorer.config.ts'),
      `const configuration = { connections: { local: { address: 'localhost:7233' } } };
export default configuration;
`,
    );

    const run = await runCommand(['runs', 'list', '--project', root, '--connection', 'staging']);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('Connection profile "staging" was not found');
    expect(run.stderr).toContain('Available profiles: local');
  });

  it('lists runs and fetches histories through configured connections', async () => {
    const environment = await TestWorkflowEnvironment.createLocal();

    try {
      const taskQueue = 'live-cli-task-queue';
      const worker = await Worker.create({
        connection: environment.nativeConnection,
        ...(environment.namespace ? { namespace: environment.namespace } : {}),
        taskQueue,
        workflowsPath,
        activities,
      });

      await worker.runUntil(async () => {
        const handle = await environment.client.workflow.start('basicOrderWorkflow', {
          workflowId: 'live-cli-order',
          taskQueue,
          args: [
            {
              orderId: 'order-cli',
              paymentToken: 'cli-token',
              shippingAddress: '789 CLI Court',
            },
          ],
        });
        await handle.result();
      });

      // A temp project copy with a connection profile pointing at the server.
      const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-live-cli-'));
      await cp(committedFixture, root, { recursive: true });
      await Bun.write(
        join(root, 'temporal-explorer.config.ts'),
        `const configuration = {
  connections: { local: { address: '${environment.address}', namespace: '${environment.namespace ?? 'default'}' } },
};
export default configuration;
`,
      );

      let listRun = await runCommand([
        'runs',
        'list',
        '--project',
        root,
        '--connection',
        'local',
        '--workflow-type',
        'basicOrderWorkflow',
      ]);

      // Visibility is eventually consistent; retry the listing briefly.
      for (
        let attempt = 0;
        attempt < 5 && !listRun.stdout.includes('live-cli-order');
        attempt += 1
      ) {
        await Bun.sleep(500);
        listRun = await runCommand([
          'runs',
          'list',
          '--project',
          root,
          '--connection',
          'local',
          '--workflow-type',
          'basicOrderWorkflow',
        ]);
      }

      expect(listRun.exitCode).toBe(0);
      expect(listRun.stdout).toContain('live-cli-order');
      expect(listRun.stdout).toContain('status: COMPLETED');

      const fetchRun = await runCommand([
        'history',
        'fetch',
        '--project',
        root,
        '--connection',
        'local',
        '--workflow-id',
        'live-cli-order',
      ]);

      expect(fetchRun.exitCode).toBe(0);
      expect(fetchRun.stdout).toContain('Fetched');
      expect(fetchRun.stdout).toContain('basicOrderWorkflow');

      const artifactPathMatch = fetchRun.stdout.match(/Wrote (.+trace\.json)/u);
      expect(artifactPathMatch).not.toBeNull();

      const traceJson: unknown = await Bun.file(artifactPathMatch?.[1] ?? '').json();
      expect(isImportedTrace(traceJson)).toBe(true);

      if (!isImportedTrace(traceJson)) {
        throw new Error('Imported trace artifact did not match the expected shape.');
      }

      const trace = traceJson;
      expect(trace.execution.status).toBe('completed');
      expect(trace.payloads.every((payload) => !payload.decoded && payload.redacted)).toBe(true);
    } finally {
      await environment.teardown();
    }
  }, 120_000);
});
