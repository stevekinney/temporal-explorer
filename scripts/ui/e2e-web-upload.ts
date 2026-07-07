import { extname, join, normalize } from 'node:path';

import { chromium, expect } from '@playwright/test';

import { collectBrowserErrors } from './browser-errors';

const repositoryRoot = new URL('../../', import.meta.url).pathname;
const buildRoot = join(repositoryRoot, 'apps/explorer/build');
const fixtureRoot = join(repositoryRoot, 'fixtures/basic-order');
const historyPath = join(fixtureRoot, 'histories/success.json');

const contentTypes = new Map([
  ['.css', 'text/css'],
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
]);

function contentTypeFor(pathname: string): string {
  return contentTypes.get(extname(pathname)) ?? 'application/octet-stream';
}

async function resolveStaticFile(pathname: string): Promise<string> {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath =
    decodedPath === '/' ? 'index.html' : normalize(decodedPath.replace(/^\/+/, ''));
  const candidate = relativePath.startsWith('..')
    ? join(buildRoot, 'index.html')
    : join(buildRoot, relativePath);

  if (await Bun.file(candidate).exists()) {
    return candidate;
  }

  return join(buildRoot, 'index.html');
}

function startStaticServer(): { url: string; stop: () => Promise<void> } {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const filePath = await resolveStaticFile(url.pathname);

      return new Response(Bun.file(filePath), {
        headers: {
          'content-type': contentTypeFor(filePath),
        },
      });
    },
  });

  return {
    url: `http://${server.hostname}:${server.port}`,
    stop: () => Promise.resolve(server.stop(true)),
  };
}

async function runWebUploadSmokeTest(): Promise<void> {
  const server = startStaticServer();
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    const assertNoBrowserErrors = collectBrowserErrors(page);

    await page.goto(server.url, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Temporal Explorer' })).toBeVisible();

    await page.locator('input[webkitdirectory]').setInputFiles(fixtureRoot);
    await page.getByRole('heading', { name: 'basicOrderWorkflow' }).waitFor({ timeout: 60_000 });
    await page.getByRole('tab', { name: /Flow/ }).click();
    await page.locator('.temporal-flow-node', { hasText: 'validateOrder' }).waitFor();
    await expect(page.getByText('static analysis only')).toBeVisible();

    await page.locator('input[accept="application/json,.json"]').setInputFiles(historyPath);
    await expect(page.getByText('Runtime status')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('completed').first()).toBeVisible();

    await page.getByRole('button', { name: 'Remove history' }).click();
    await expect(page.getByText('static analysis only')).toBeVisible();

    assertNoBrowserErrors();
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log('Explorer web upload e2e smoke test passed.');
}

await runWebUploadSmokeTest();
