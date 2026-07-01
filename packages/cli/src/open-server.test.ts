import { chmod, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { main } from './index';
import { startExplorerServer } from './open-server';

const fixtureRoot = new URL('../../../fixtures/basic-order', import.meta.url).pathname;

type CommandRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

async function runCommand(args: string[], isInteractive = false): Promise<CommandRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await main(args, {
    stdout: (text) => {
      stdout.push(text);
    },
    stderr: (text) => {
      stderr.push(text);
    },
    isInteractive,
  });

  return {
    exitCode,
    stdout: stdout.join(''),
    stderr: stderr.join(''),
  };
}

async function withFakeBunExecutable(script: string, callback: () => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'temporal-explorer-fake-bun-'));
  const executable = join(directory, 'bun');
  const originalPath = Bun.env['PATH'];

  await Bun.write(executable, script);
  await chmod(executable, 0o755);
  Bun.env['PATH'] = directory;

  try {
    await callback();
  } finally {
    if (originalPath === undefined) {
      delete Bun.env['PATH'];
    } else {
      Bun.env['PATH'] = originalPath;
    }
  }
}

async function occupyConsecutivePorts(count: number): Promise<{
  startPort: number;
  servers: ReturnType<typeof Bun.serve>[];
}> {
  for (let startPort = 57_173; startPort < 58_000; startPort += count) {
    const servers: ReturnType<typeof Bun.serve>[] = [];

    try {
      for (let offset = 0; offset < count; offset += 1) {
        servers.push(
          Bun.serve({
            hostname: '127.0.0.1',
            port: startPort + offset,
            fetch: () => new Response('occupied'),
          }),
        );
      }

      return { startPort, servers };
    } catch {
      await Promise.all(servers.map((server) => server.stop(true)));
    }
  }

  throw new Error('Could not occupy a consecutive local port block.');
}

async function expectServerStartFailure(
  options: Parameters<typeof startExplorerServer>[0],
  expectedMessage: string,
): Promise<void> {
  try {
    await startExplorerServer(options);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw new Error('Expected server startup to fail with an Error instance.', { cause: error });
    }

    expect(error.message).toContain(expectedMessage);
    return;
  }

  throw new Error(`Expected server startup to fail with ${expectedMessage}.`);
}

describe('temporal-explorer open server', () => {
  it('validates explorer server startup failure paths', async () => {
    const missingAnalysisRoot = await mkdtemp(
      join(tmpdir(), 'temporal-explorer-missing-analysis-'),
    );
    const { startPort, servers } = await occupyConsecutivePorts(5);

    await expectServerStartFailure(
      { projectRoot: missingAnalysisRoot },
      'Missing analysis artifact:',
    );

    try {
      await expectServerStartFailure(
        { projectRoot: fixtureRoot, port: startPort },
        `Could not find an available port starting at ${startPort}.`,
      );
    } finally {
      await Promise.all(servers.map((server) => server.stop(true)));
    }
  });

  it('stops explorer servers idempotently', async () => {
    const server = await startExplorerServer({ projectRoot: fixtureRoot });

    await server.stop();
    await server.stop();

    expect(server.url).toContain(`http://127.0.0.1:${server.port}/`);
  });

  it('waits for interactive explorer servers to exit', async () => {
    const actualBunPath = process.execPath;

    await withFakeBunExecutable(
      `#!/bin/sh\nexec "${actualBunPath}" --eval 'const server = Bun.serve({ hostname: "127.0.0.1", port: Number(Bun.env.PORT), fetch: () => new Response("ok") }); setTimeout(async () => { await server.stop(true); process.exit(0); }, 500);'\n`,
      async () => {
        const result = await runCommand(['open', '--project', fixtureRoot], true);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Press Ctrl+C to stop the local explorer.');
      },
    );
  });

  it('cleans up when explorer server processes exit or never become ready', async () => {
    await withFakeBunExecutable('#!/bin/sh\nexit 17\n', async () => {
      await expectServerStartFailure(
        { projectRoot: fixtureRoot },
        'Explorer server exited before becoming ready with code',
      );
    });

    await withFakeBunExecutable('#!/bin/sh\n/bin/sleep 10\n', async () => {
      await expectServerStartFailure(
        { projectRoot: fixtureRoot },
        'Explorer server did not respond at',
      );
    });
  });
});
