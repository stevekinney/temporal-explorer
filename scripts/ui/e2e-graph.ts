import { chromium, expect } from '@playwright/test';

import { startExplorerServer } from '../../packages/cli/src/open-server';
import { collectBrowserErrors } from './browser-errors';

const fixtureRoot = new URL('../../fixtures/basic-order/', import.meta.url).pathname;

async function runGraphInteractionTest(): Promise<void> {
  const server = await startExplorerServer({ projectRoot: fixtureRoot, trace: 'success' });
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    const assertNoBrowserErrors = collectBrowserErrors(page);

    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /Flow/ }).click();
    await page.locator('.temporal-flow-node', { hasText: 'validateOrder' }).waitFor();

    await page.getByRole('button', { name: /chargeCard scheduled/ }).click();
    await expect(page.locator('.temporal-flow-node[data-active="true"]')).toContainText(
      'chargeCard',
    );
    await expect(page.getByRole('complementary', { name: 'Selection inspector' })).toContainText(
      'Event 11 ActivityTaskScheduled',
    );

    await page.locator('.temporal-flow-node', { hasText: 'validateOrder' }).click();
    await expect(page.getByRole('button', { name: /validateOrder scheduled/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /chargeCard scheduled/ })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Selection inspector' })).toContainText(
      'src/workflows/basic-order-workflow.ts:17',
    );
    await expect(page.getByRole('complementary', { name: 'Selection inspector' })).toContainText(
      'Event 5 ActivityTaskScheduled',
    );

    await page.getByRole('button', { name: /Activity 1 edge/ }).click();
    await expect(page.getByRole('complementary', { name: 'Selection inspector' })).toContainText(
      'Directed static execution order.',
    );

    assertNoBrowserErrors();
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log('Explorer graph interaction test passed.');
}

await runGraphInteractionTest();
