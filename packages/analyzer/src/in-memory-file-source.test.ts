import { existsSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { InMemoryFileSource, analyzeProject, loadTemporalExplorerProject } from './index';
import { isAbsoluteProjectPath, resolveProjectPath } from './paths';

const fixturesRoot = new URL('../../../fixtures/', import.meta.url).pathname;
const analysisFixtureNames = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((fixtureName) =>
    existsSync(`${fixturesRoot}${fixtureName}/.temporal-explorer/analysis.json`),
  )
  .toSorted((left, right) => left.localeCompare(right));

describe('in-memory file source', () => {
  it('lists, reads, hashes, and creates projects from uploaded files', async () => {
    const fileSource = new InMemoryFileSource(
      [
        [
          '/project/src/workflows.ts',
          "import { sleep } from '@temporalio/workflow';\nexport async function memoryWorkflow(): Promise<void> { await sleep('1 second'); }\n",
        ],
        ['/project/src/worker.ts', "import { Worker } from '@temporalio/worker';\n"],
        ['/project/src/ignored.test.ts', 'export const ignored = true;\n'],
        ['/project/package.json', '{"dependencies":{"@temporalio/workflow":"^1.18.1"}}\n'],
        ['/project/tsconfig.json', '{"compilerOptions":{"strict":true}}\n'],
      ],
      '/project',
    );

    expect(await fileSource.exists('/project/src/workflows.ts')).toBe(true);
    expect(await fileSource.read('/project/package.json')).toContain('@temporalio/workflow');
    expect(await fileSource.list(['**/*.ts'])).toEqual([
      '/project/src/worker.ts',
      '/project/src/workflows.ts',
    ]);
    expect(await fileSource.hash('/project/package.json')).toHaveLength(64);

    const project = await fileSource.createProject('/project/tsconfig.json', [
      '/project/src/workflows.ts',
    ]);
    expect(
      project.getSourceFile('/project/src/workflows.ts')?.getFunction('memoryWorkflow'),
    ).toBeDefined();
  });

  it('treats Windows drive roots as absolute project paths', () => {
    expect(isAbsoluteProjectPath('C:/repo')).toBe(true);
    expect(resolveProjectPath('C:/repo', 'C:/repo/src/workflows.ts')).toBe(
      'C:/repo/src/workflows.ts',
    );
  });

  it('parses uploaded JSONC tsconfig compiler options from extended configs', async () => {
    const fileSource = new InMemoryFileSource(
      [
        [
          '/project/src/workflows.ts',
          "import { helper } from '@shared/helper';\nimport { sleep } from '@temporalio/workflow';\nexport async function memoryWorkflow(): Promise<void> { helper(); await sleep('1 second'); }\n",
        ],
        ['/project/src/shared/helper.ts', 'export function helper(): void {}\n'],
        [
          '/project/tsconfig.json',
          '{\n  // Browser uploads preserve normal tsconfig JSONC.\n  "extends": "./tsconfig.base.json",\n  "compilerOptions": { "strict": true },\n}\n',
        ],
        [
          '/project/tsconfig.base.json',
          '{\n  "compilerOptions": {\n    "baseUrl": "src",\n    "paths": { "@shared/*": ["shared/*"] },\n  },\n}\n',
        ],
      ],
      '/project',
    );
    const project = await fileSource.createProject('/project/tsconfig.json', [
      '/project/src/workflows.ts',
    ]);
    const workflowFile = project.getSourceFileOrThrow('/project/src/workflows.ts');

    expect(
      String(
        workflowFile
          .getImportDeclaration('@shared/helper')
          ?.getModuleSpecifierSourceFile()
          ?.getFilePath(),
      ),
    ).toBe('/project/src/shared/helper.ts');
  });

  it('has committed analysis artifacts for every expected parity fixture', () => {
    expect(analysisFixtureNames).toHaveLength(29);
  });

  for (const fixtureName of analysisFixtureNames) {
    it(`matches committed analysis for ${fixtureName}`, async () => {
      const fixtureRoot = new URL(`../../../fixtures/${fixtureName}/`, import.meta.url).pathname;
      const virtualRoot = `/project/${fixtureName}`;
      const fileEntries: [string, string][] = [];
      const sourceGlob = new Bun.Glob('**/*');

      for await (const relativePath of sourceGlob.scan({ cwd: fixtureRoot, onlyFiles: true })) {
        fileEntries.push([
          `${virtualRoot}/${relativePath}`,
          await Bun.file(`${fixtureRoot}${relativePath}`).text(),
        ]);
      }

      const fileSource = new InMemoryFileSource(fileEntries, virtualRoot);
      const project = await loadTemporalExplorerProject({
        root: virtualRoot,
        fileSource,
      });
      const analysis = await analyzeProject(project);
      const committed = await Bun.file(`${fixtureRoot}.temporal-explorer/analysis.json`).json();

      expect(analysis).toEqual(committed);
    });
  }
});
