import { chromium } from '@playwright/test';
import type { AxeResults } from 'axe-core';
import { createRequire } from 'node:module';

import { startExplorerServer } from '../../packages/cli/src/open-server';
import { collectBrowserErrors } from './browser-errors';
import { warmUpServer } from './warm-up-server';

const fixtureRoot = new URL('../../fixtures/basic-order/', import.meta.url).pathname;
const require = createRequire(import.meta.url);
const axeSourcePath = require.resolve('axe-core/axe.min.js');

async function runAccessibilityAudit(): Promise<void> {
  const server = await startExplorerServer({ projectRoot: fixtureRoot });
  await warmUpServer(server.url);
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const assertNoBrowserErrors = collectBrowserErrors(page);
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'basicOrderWorkflow' }).waitFor();
    await page.addScriptTag({ content: await Bun.file(axeSourcePath).text() });

    const results = await page.evaluate<AxeResults>(async () => {
      const axeWindow = globalThis as typeof globalThis & {
        axe: {
          run: () => Promise<AxeResults>;
        };
      };

      return await axeWindow.axe.run();
    });

    if (results.violations.length > 0) {
      const summary = results.violations
        .map((violation) => `${violation.id}: ${violation.nodes.length} node(s)`)
        .join('\n');
      throw new Error(`Accessibility violations found:\n${summary}`);
    }

    assertNoBrowserErrors();
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log('Explorer accessibility audit passed.');
}

await runAccessibilityAudit();
