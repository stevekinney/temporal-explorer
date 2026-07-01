import { chromium } from '@playwright/test';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startExplorerServer } from '../../packages/cli/src/open-server';
import { collectBrowserErrors } from './browser-errors';

const fixtureRoot = new URL('../../fixtures/basic-order/', import.meta.url).pathname;
const screenshotPath = join(tmpdir(), 'temporal-explorer-flow.png');

async function verifyScreenshots(): Promise<void> {
  const server = await startExplorerServer({ projectRoot: fixtureRoot, trace: 'success' });
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    const assertNoBrowserErrors = collectBrowserErrors(page);

    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /Flow/ }).click();
    await page.locator('.temporal-flow-node', { hasText: 'shipOrder' }).waitFor();
    await page.locator('.flow-stage').screenshot({ path: screenshotPath });

    const screenshotStats = await stat(screenshotPath);
    if (screenshotStats.size < 12_000) {
      throw new Error(`Flow screenshot is unexpectedly small: ${screenshotStats.size} bytes.`);
    }

    assertNoBrowserErrors();
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log(`Explorer screenshot verification passed: ${screenshotPath}`);
}

await verifyScreenshots();
