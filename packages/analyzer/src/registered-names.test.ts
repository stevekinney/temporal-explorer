import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { WorkflowDefinition } from '@temporal-explorer/schemas';

import { analyzeWorkflowFiles } from './index';

/**
 * Builds a temp project shaped like the Temporal worker-versioning sample: a
 * base file declares the implementation functions, and per-version barrels
 * re-export them under registered aliases (`export { implV1 as AutoUpgrading }`).
 */
async function createReExportBarrelProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-registered-names-'));
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
    join(root, 'src', 'workflows-base.ts'),
    `
import { sleep } from '@temporalio/workflow';

export async function autoUpgradingWorkflowV1(): Promise<void> {
  await sleep('1 second');
}

export async function autoUpgradingWorkflowV1b(): Promise<void> {
  await sleep('2 seconds');
}

export async function pinnedWorkflowV1(): Promise<void> {
  await sleep('1 second');
}

export async function pinnedWorkflowV2(): Promise<void> {
  await sleep('2 seconds');
}

export async function plainWorkflow(): Promise<void> {
  await sleep('1 second');
}
`,
  );
  await Bun.write(
    join(root, 'src', 'workflows-v1.ts'),
    `export { autoUpgradingWorkflowV1 as AutoUpgrading, pinnedWorkflowV1 as Pinned, plainWorkflow } from './workflows-base';\n`,
  );
  await Bun.write(
    join(root, 'src', 'workflows-v2.ts'),
    `export { autoUpgradingWorkflowV1b as AutoUpgrading, pinnedWorkflowV2 as Pinned } from './workflows-base';\n`,
  );
  return root;
}

function byId(workflows: WorkflowDefinition[], id: string): WorkflowDefinition | undefined {
  return workflows.find((workflow) => workflow.id === id);
}

describe('registered workflow names', () => {
  it('names a Workflow by its exported alias while keeping the implementation identity', async () => {
    const projectRoot = await createReExportBarrelProject();

    const analysis = await analyzeWorkflowFiles({
      projectRoot,
      tsconfig: 'tsconfig.json',
      workflowFiles: ['src/workflows-v1.ts', 'src/workflows-v2.ts'],
    });

    // The base file is analyzed once (deduped by path); every implementation it
    // declares surfaces, keyed by an impl-derived id regardless of alias.
    expect(analysis.workflows.map((workflow) => workflow.id).toSorted()).toEqual([
      'workflow:autoUpgradingWorkflowV1',
      'workflow:autoUpgradingWorkflowV1b',
      'workflow:pinnedWorkflowV1',
      'workflow:pinnedWorkflowV2',
      'workflow:plainWorkflow',
    ]);

    // Aliased re-exports register under the exported name; the implementation
    // function name is preserved separately, and the id stays impl-derived.
    const autoUpgradingV1 = byId(analysis.workflows, 'workflow:autoUpgradingWorkflowV1');
    expect(autoUpgradingV1?.name).toBe('AutoUpgrading');
    expect(autoUpgradingV1?.implementationName).toBe('autoUpgradingWorkflowV1');

    // Distinct implementations may register under the same name by design
    // (worker versioning). The display name collides; the identity does not.
    const autoUpgradingV1b = byId(analysis.workflows, 'workflow:autoUpgradingWorkflowV1b');
    expect(autoUpgradingV1b?.name).toBe('AutoUpgrading');
    expect(autoUpgradingV1b?.implementationName).toBe('autoUpgradingWorkflowV1b');

    const pinnedV1 = byId(analysis.workflows, 'workflow:pinnedWorkflowV1');
    expect(pinnedV1?.name).toBe('Pinned');
    expect(pinnedV1?.implementationName).toBe('pinnedWorkflowV1');

    const pinnedV2 = byId(analysis.workflows, 'workflow:pinnedWorkflowV2');
    expect(pinnedV2?.name).toBe('Pinned');
    expect(pinnedV2?.implementationName).toBe('pinnedWorkflowV2');
  });

  it('leaves a non-aliased re-export named after its implementation, with no implementationName', async () => {
    const projectRoot = await createReExportBarrelProject();

    const analysis = await analyzeWorkflowFiles({
      projectRoot,
      tsconfig: 'tsconfig.json',
      workflowFiles: ['src/workflows-v1.ts', 'src/workflows-v2.ts'],
    });

    const plain = byId(analysis.workflows, 'workflow:plainWorkflow');
    expect(plain?.name).toBe('plainWorkflow');
    expect(plain?.implementationName).toBeUndefined();
  });
});
