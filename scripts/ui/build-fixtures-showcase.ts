/**
 * Builds the public "fixtures showcase" — the explorer prerendered to a static
 * site that ships every example Workflow with its runtime overlay, for hosting
 * on Vercel so people can explore in the browser without a local checkout.
 *
 * Two steps:
 *   1. Aggregate every committed fixture into one synthetic project (the same
 *      `buildAggregate` the local `explorer:fixtures` dev server uses).
 *   2. Run the SvelteKit build with `VERCEL=1` (→ adapter-vercel) and point
 *      `TEMPORAL_EXPLORER_PROJECT` at that aggregate. `+page.server.ts` sets
 *      `prerender = true` when `VERCEL` is set, so the whole page renders to
 *      static HTML at build time — no serverless function, no runtime file reads.
 *
 * Runs both locally (to verify the deploy build) and as the Vercel build command.
 *
 * Usage:
 *   bun run scripts/ui/build-fixtures-showcase.ts
 */
import { join } from 'node:path';

import { buildAggregate } from '../fixtures/aggregate';

const repoRoot = new URL('../../', import.meta.url).pathname;
const explorerDirectory = join(repoRoot, 'apps', 'explorer');
// Absolute so `loadExplorerArtifacts` resolves it regardless of the build's cwd.
const showcaseRoot = join(explorerDirectory, '.explorer-showcase');

const summary = await buildAggregate(showcaseRoot);
console.log(
  `Aggregated ${summary.workflows} workflows from ${summary.fixtures} fixtures ` +
    `(${summary.traces} traces, ${summary.overlays} overlays).`,
);

const build = Bun.spawn({
  cmd: ['bunx', 'vite', 'build'],
  cwd: explorerDirectory,
  env: {
    ...process.env,
    VERCEL: '1',
    TEMPORAL_EXPLORER_PROJECT: showcaseRoot,
    TEMPORAL_EXPLORER_PROJECT_NAME: 'Example Workflows',
  },
  stdout: 'inherit',
  stderr: 'inherit',
});

if ((await build.exited) !== 0) {
  throw new Error('Explorer showcase build failed.');
}

console.log('\nFixtures showcase built to apps/explorer/.vercel/output (adapter-vercel).');
