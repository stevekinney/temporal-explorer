/**
 * Proves generated declaration artifacts are usable from Temporal SDK-style
 * consumers: for every fixture Workflow declaration, a client-style consumer
 * module imports the `.d.ts` and exercises the Workflow function type and its
 * message descriptors, then the whole program is type-checked.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from 'ts-morph';

const fixturesRoot = new URL('../../fixtures/', import.meta.url).pathname;

async function listDeclarationFixtures(): Promise<{ fixture: string; files: string[] }[]> {
  const fixtures: { fixture: string; files: string[] }[] = [];

  for (const entry of await readdir(fixturesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const declarationDirectory = join(fixturesRoot, entry.name, '.temporal-explorer', 'workflows');

    try {
      const entries = await readdir(declarationDirectory);
      const files = entries
        .filter((file) => file.endsWith('.d.ts'))
        .toSorted((left, right) => left.localeCompare(right));

      if (files.length > 0) {
        fixtures.push({ fixture: entry.name, files });
      }
    } catch {
      continue;
    }
  }

  return fixtures;
}

function createConsumerSource(declarationPath: string, workflowName: string): string {
  const specifier = declarationPath.replace(/\.d\.ts$/u, '');

  return `
import type { Client } from '@temporalio/client';
import type { ${workflowName} } from '${specifier}';

/** A Temporal SDK-style consumer that starts the Workflow with typed arguments. */
export async function start${workflowName}(client: Client, taskQueue: string) {
  return await client.workflow.start<typeof ${workflowName}>('${workflowName}', {
    workflowId: '${workflowName}-consumer',
    taskQueue,
    args: [] as unknown as Parameters<typeof ${workflowName}>,
  });
}

export type ${workflowName}Result = Awaited<ReturnType<typeof ${workflowName}>>;
`;
}

const project = new Project({
  compilerOptions: {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: 99,
    moduleResolution: 100,
    target: 99,
  },
});

let consumers = 0;

for (const { fixture, files } of await listDeclarationFixtures()) {
  for (const file of files) {
    const workflowName = file.replace(/\.d\.ts$/u, '');
    const declarationPath = join(fixturesRoot, fixture, '.temporal-explorer', 'workflows', file);
    project.addSourceFileAtPath(declarationPath);
    project.createSourceFile(
      join(fixturesRoot, fixture, '.temporal-explorer', 'workflows', `${workflowName}.consumer.ts`),
      createConsumerSource(`./${workflowName}`, workflowName),
      { overwrite: true },
    );
    consumers += 1;
  }
}

if (consumers === 0) {
  throw new Error('No declaration artifacts were found to type-check.');
}

const diagnostics = project.getPreEmitDiagnostics();

if (diagnostics.length > 0) {
  console.error(project.formatDiagnosticsWithColorAndContext(diagnostics));
  throw new Error(
    `Declaration consumers failed type-checking with ${diagnostics.length} error(s).`,
  );
}

console.log(`Type-checked ${consumers} declaration consumer(s).`);
