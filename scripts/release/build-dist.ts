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

// The explorer UI ships as a self-contained adapter-node server (see
// apps/explorer/vite.config.ts's `ssr.noExternal: true`) so `open` can spawn
// it without the app's devDependencies or a node_modules tree present.
// SvelteKit embeds a build-generation hash in both the server output and the
// client bundle; rebuilding without clearing .svelte-kit/build first can
// leave stale hashed chunks around and desync that hash from the fresh
// server output, so start from a clean slate every time.
await $`rm -rf apps/explorer/.svelte-kit apps/explorer/build`;
await $`bun run build`.cwd('apps/explorer').quiet();
await $`mkdir -p dist/explorer`;
await $`cp -R apps/explorer/build dist/explorer/build`;

console.log('Built dist/cli, dist/api, dist/schemas, and dist/explorer.');
