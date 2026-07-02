import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { analyzeWorkflowFiles } from './index';

describe('destructured Activity proxy bindings', () => {
  it('extracts Activity calls from destructured proxyActivities bindings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-destructured-'));
    await mkdir(join(root, 'src'), { recursive: true });
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
      join(root, 'src', 'activities.ts'),
      `export async function reserveInventory(sku: string): Promise<string> {
  return sku;
}

export async function sendReceipt(email: string): Promise<void> {
  void email;
}
`,
    );
    // The flat src/workflows.ts convention plus destructuring with a rename:
    // both are the dominant shapes in real Temporal TypeScript projects.
    await Bun.write(
      join(root, 'src', 'workflows.ts'),
      `import { proxyActivities } from '@temporalio/workflow';

import type * as activities from './activities';

const { reserveInventory, sendReceipt: deliverReceipt } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
});

export async function purchaseWorkflow(sku: string, email: string): Promise<string> {
  const reservation = await reserveInventory(sku);
  await deliverReceipt(email);
  return reservation;
}
`,
    );

    const analysis = await analyzeWorkflowFiles({
      projectRoot: root,
      tsconfig: 'tsconfig.json',
      workflowFiles: ['src/workflows.ts'],
    });
    const workflow = analysis.workflows.find((candidate) => candidate.name === 'purchaseWorkflow');
    const activityCommands = (workflow?.temporalCommands ?? []).filter(
      (command) => command.kind === 'activity',
    );

    expect(activityCommands.map((command) => command.name)).toEqual([
      'reserveInventory',
      'sendReceipt',
    ]);
    expect(analysis.activities.map((activity) => activity.name)).toEqual([
      'reserveInventory',
      'sendReceipt',
    ]);
  });
});
