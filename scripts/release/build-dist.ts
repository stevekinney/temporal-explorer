/**
 * Builds the publishable dist bundles for the temporal-explorer package:
 * the CLI binary and the library/schemas entrypoints, with third-party
 * dependencies externalized to the package's own node_modules.
 */
import { $ } from 'bun';

const externals = [
  '--external',
  'ts-morph',
  '--external',
  'zod',
  '--external',
  '@temporalio/*',
  '--external',
  'prettier',
];

await $`rm -rf dist`;
await $`bun build packages/cli/src/bin.ts --target=bun --outdir=dist/cli --entry-naming index.js ${externals}`.quiet();
await $`bun build packages/api/src/index.ts --target=bun --outdir=dist/api --entry-naming index.js ${externals}`.quiet();
await $`bun build packages/schemas/src/index.ts --target=bun --outdir=dist/schemas --entry-naming index.js ${externals}`.quiet();

console.log('Built dist/cli, dist/api, and dist/schemas.');
