import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { analyzeProject, loadTemporalExplorerProject } from './index';

const tsconfig = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
  },
  include: ['**/*.ts'],
});

async function analyzeDiscovered(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'temporal-explorer-discovery-'));
  await Bun.write(join(root, 'tsconfig.json'), tsconfig);

  for (const [relativePath, contents] of Object.entries(files)) {
    await mkdir(join(root, relativePath, '..'), { recursive: true });
    await Bun.write(join(root, relativePath), contents);
  }

  return analyzeProject(await loadTemporalExplorerProject({ root }));
}

describe('content-based workflow discovery', () => {
  it('discovers workflow modules that do not match the filename globs', async () => {
    // A file named `cancellation-scopes.ts` (no `workflows/` dir, not `workflows.ts`)
    // is invisible to the filename globs but imports the workflow module.
    const analysis = await analyzeDiscovered({
      'src/cancellation-scopes.ts': `import { CancellationScope, sleep } from '@temporalio/workflow';

export async function nonCancellable(): Promise<void> {
  await CancellationScope.nonCancellable(async () => {
    await sleep('1s');
  });
}
`,
    });

    expect(analysis.workflows.map((workflow) => workflow.name)).toContain('nonCancellable');
  });

  it('discovers a flat root-level workflow file with no src directory', async () => {
    const analysis = await analyzeDiscovered({
      'my-workflow.ts': `import { sleep } from '@temporalio/workflow';

export async function flatWorkflow(): Promise<void> {
  await sleep('1s');
}
`,
    });

    expect(analysis.workflows.map((workflow) => workflow.name)).toContain('flatWorkflow');
  });

  it('emits a diagnostic when a worker is present but no workflows are found', async () => {
    const analysis = await analyzeDiscovered({
      'src/worker.ts': `import { Worker } from '@temporalio/worker';

async function run() {
  const worker = await Worker.create({ taskQueue: 'q', workflowsPath: './nowhere' });
  await worker.run();
}

void run();
`,
    });

    expect(analysis.workflows).toHaveLength(0);
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'TEA_NO_WORKFLOWS_FOUND',
    );
  });

  it('does not treat a type-only workflow import as a workflow module', async () => {
    const analysis = await analyzeDiscovered({
      'src/interceptors.ts': `import type { WorkflowInterceptorsFactory } from '@temporalio/workflow';

export const interceptors: WorkflowInterceptorsFactory = () => ({});
`,
    });

    expect(analysis.workflows).toHaveLength(0);
  });
});
