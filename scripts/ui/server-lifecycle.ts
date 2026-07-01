import { startExplorerServer } from '../../packages/cli/src/open-server';

const fixtureRoot = new URL('../../fixtures/basic-order/', import.meta.url).pathname;

async function verifyServerLifecycle(): Promise<void> {
  const server = await startExplorerServer({ projectRoot: fixtureRoot });
  const readinessUrl = new URL('/@vite/client', server.url);
  const response = await fetch(readinessUrl, { signal: AbortSignal.timeout(1_000) });

  if (!response.ok) {
    await server.stop();
    throw new Error(`Explorer server responded with ${response.status}.`);
  }

  await server.stop();

  try {
    await fetch(readinessUrl, { signal: AbortSignal.timeout(500) });
    throw new Error('Explorer server still responded after stop().');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Explorer server still responded after stop().'
    ) {
      throw error;
    }
  }

  console.log('Explorer server lifecycle passed.');
}

await verifyServerLifecycle();
