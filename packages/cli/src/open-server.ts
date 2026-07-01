import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ExplorerServerOptions = {
  projectRoot: string;
  port?: number;
  trace?: string;
  inheritOutput?: boolean;
};

export type RunningExplorerServer = {
  url: string;
  port: number;
  stop: () => Promise<void>;
  waitForExit: () => Promise<number>;
};

const explorerAppRoot = fileURLToPath(new URL('../../../apps/explorer/', import.meta.url));

function ensurePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid port: ${port}.`);
  }
}

async function findAvailablePort(start: number): Promise<number> {
  ensurePort(start);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = start + attempt;

    try {
      const probe = Bun.serve({
        hostname: '127.0.0.1',
        port,
        fetch: () => new Response('ok'),
      });
      try {
        await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_000) });
      } finally {
        await probe.stop(true);
      }
      return port;
    } catch {
      continue;
    }
  }

  throw new Error(`Could not find an available port starting at ${start}.`);
}

async function verifyAnalysisArtifact(projectRoot: string): Promise<void> {
  const analysisPath = join(projectRoot, '.temporal-explorer', 'analysis.json');

  if (!(await Bun.file(analysisPath).exists())) {
    throw new Error(
      `Missing analysis artifact: ${analysisPath}. Run temporal-explorer analyze first.`,
    );
  }
}

async function waitForServer(url: string, process: ReturnType<typeof Bun.spawn>): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(
        `Explorer server exited before becoming ready with code ${process.exitCode}.`,
      );
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });

      if (response.ok) {
        return;
      }
    } catch {
      // Wait and retry below.
    }

    await Bun.sleep(750);
  }

  throw new Error(`Explorer server did not respond at ${url}.`);
}

/** Starts the local SvelteKit explorer against committed Temporal Explorer artifacts. */
export async function startExplorerServer(
  options: ExplorerServerOptions,
): Promise<RunningExplorerServer> {
  const projectRoot = resolve(options.projectRoot);
  await verifyAnalysisArtifact(projectRoot);

  const port = await findAvailablePort(options.port ?? 5173);
  const process = Bun.spawn({
    cmd: ['bun', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)],
    cwd: explorerAppRoot,
    env: {
      ...Bun.env,
      PORT: String(port),
      TEMPORAL_EXPLORER_PROJECT: projectRoot,
    },
    stdout: options.inheritOutput ? 'inherit' : 'ignore',
    stderr: options.inheritOutput ? 'inherit' : 'ignore',
  });
  const url = new URL(`http://127.0.0.1:${port}/`);
  if (options.trace) {
    url.searchParams.set('trace', options.trace);
  }
  const serverReadinessUrl = `http://127.0.0.1:${port}/@vite/client`;
  let stopped = false;

  async function stop(): Promise<void> {
    if (stopped) {
      return;
    }

    stopped = true;
    process.kill();
    await process.exited;
  }

  try {
    await waitForServer(serverReadinessUrl, process);
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    url: url.toString(),
    port,
    stop,
    waitForExit: async () => await process.exited,
  };
}
