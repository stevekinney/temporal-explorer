/**
 * Dev tool: serve the explorer UI with *every* fixture loaded at once, for
 * manual visual inspection of the flow-graph rendering.
 *
 * The aggregate project is built by the shared `buildAggregate` helper (also
 * used by the Vercel showcase build); this script layers a local server on top.
 *
 * Usage:
 *   bun run scripts/ui/explore-all-fixtures.ts [--port <n>]
 */
import { join } from 'node:path';

import { startExplorerServer } from '../../packages/cli/src/open-server';
import { buildAggregate } from '../fixtures/aggregate';

const repoRoot = new URL('../../', import.meta.url).pathname;
// A gitignored synthetic project; its basename becomes the explorer's project name.
const outputRoot = join(repoRoot, '.explorer-cache', 'all-fixtures');

function getFlagValue(flag: string): string | undefined {
  const index = Bun.argv.indexOf(flag);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

/** Builds the explorer server bundle via turbo (a cache hit when nothing changed). */
async function ensureExplorerBuilt(): Promise<void> {
  console.log('Building the explorer (turbo, cached)…');
  const build = Bun.spawn({
    cmd: ['bunx', 'turbo', 'run', 'build', '--filter=./apps/explorer'],
    cwd: repoRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if ((await build.exited) !== 0) {
    throw new Error('Explorer build failed; cannot start the UI.');
  }
}

const summary = await buildAggregate(outputRoot);
console.log(
  `Loaded ${summary.workflows} workflows from ${summary.fixtures} fixtures ` +
    `(${summary.traces} traces, ${summary.overlays} overlays).`,
);

await ensureExplorerBuilt();

const requestedPort = getFlagValue('--port');
const server = await startExplorerServer({
  projectRoot: outputRoot,
  inheritOutput: true,
  ...(requestedPort ? { port: Number(requestedPort) } : {}),
});

console.log(`\n  Temporal Explorer — all fixtures\n  ${server.url}\n\n  Press Ctrl+C to stop.\n`);

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await server.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await server.waitForExit();
