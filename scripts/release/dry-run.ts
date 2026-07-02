/**
 * Release dry run: build the publishable bundles, smoke-test every entrypoint
 * the package exposes, and show what npm would pack.
 */
import { $ } from 'bun';

await $`bun run scripts/release/build-dist.ts`;

const cliHelp = await $`bun dist/cli/index.js --help`.text();

if (!cliHelp.includes('Temporal Workflow Explorer')) {
  throw new Error('Bundled CLI --help did not print the product banner.');
}

const cliList = await $`bun dist/cli/index.js list --project fixtures/basic-order`.text();

if (!cliList.includes('basicOrderWorkflow')) {
  throw new Error('Bundled CLI list did not discover the fixture workflow.');
}

// The dist bundles carry no declaration files yet, so import them through
// computed specifiers and narrow the surfaces this script exercises.
const apiModule = new URL('../../dist/api/index.js', import.meta.url).href;
const api = (await import(apiModule)) as {
  getTemporalExplorerVersion(): string;
  analyzeProject(options: { root: string }): Promise<{ value: { workflows: unknown[] } }>;
};
const analysis = await api.analyzeProject({
  root: new URL('../../fixtures/basic-order', import.meta.url).pathname,
});

if (analysis.value.workflows.length !== 1) {
  throw new Error('Bundled library analysis did not discover the fixture workflow.');
}

const schemasModule = new URL('../../dist/schemas/index.js', import.meta.url).href;
const schemas = (await import(schemasModule)) as {
  validateArtifact(value: unknown): { success: boolean };
};

if (schemas.validateArtifact(null).success !== false) {
  throw new Error('Bundled schemas validateArtifact accepted an invalid artifact.');
}

console.log(`Bundled entrypoints verified (CLI ${api.getTemporalExplorerVersion()}).`);

const packOutput = await $`npm pack --dry-run --ignore-scripts 2>&1`.text();
console.log(packOutput.split('\n').slice(-12).join('\n'));
