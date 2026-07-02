import { chromium } from '@playwright/test';

import { startExplorerServer } from '../../packages/cli/src/open-server';
import { collectBrowserErrors } from './browser-errors';
import { warmUpServer } from './warm-up-server';

const fixtureRoot = new URL('../../fixtures/basic-order/', import.meta.url).pathname;

async function runExplorerSmokeTest(): Promise<void> {
  const server = await startExplorerServer({ projectRoot: fixtureRoot });
  await warmUpServer(server.url);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const assertNoBrowserErrors = collectBrowserErrors(page);
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'basicOrderWorkflow' }).waitFor();
    await page.getByRole('tab', { name: /Activities/ }).click();
    const activityCommandsTable = page.getByRole('table', { name: 'Activity commands' });
    await activityCommandsTable.waitFor();
    await activityCommandsTable.getByRole('row', { name: /validateOrder/ }).waitFor();
    await page.getByRole('button', { name: /Inspector/ }).click();
    await page.getByRole('dialog', { name: 'Source and type inspector' }).waitFor();
    await page.getByText('src/workflows/basic-order-workflow.ts:16').waitFor();
    assertNoBrowserErrors();
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log('Explorer e2e smoke test passed.');
}

await runExplorerSmokeTest();
