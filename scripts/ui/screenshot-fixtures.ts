/**
 * Captures the Flow-view rendering of one or more fixtures for visual review.
 *
 * For each fixture it starts the explorer server against the fixture's committed
 * `.temporal-explorer` artifacts, opens the Flow tab, waits for the ELK layout to
 * settle, and screenshots the graph stage to `<out>/<fixture>.png`. This is the
 * visual half of the fixture-rendering gate; the numeric half lives in
 * `scripts/ui/graph-geometry.ts`.
 *
 * Usage:
 *   bun run scripts/ui/screenshot-fixtures.ts --out <dir> [--fixtures a,b,c] [--fit]
 *
 * `--fit` clips each capture to the graph's bounding box (with padding) instead of the
 * full stage — useful for README/doc images. Without it, the whole `.flow-stage` is
 * captured, which is what the visual gate wants.
 */
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { startExplorerServer } from '../../packages/cli/src/open-server';
import { fixtureHistories } from '../fixtures/manifest';
import { collectBrowserErrors } from './browser-errors';
import { warmUpServer } from './warm-up-server';

const fixturesRoot = new URL('../../fixtures/', import.meta.url);

function getFlagValue(flag: string): string | undefined {
  const index = Bun.argv.indexOf(flag);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

/** First generated history name for a fixture, if any (used as the runtime trace). */
function firstHistoryFor(fixture: string): string | undefined {
  return fixtureHistories.find((definition) => definition.fixture === fixture)?.history;
}

const outputDirectory = getFlagValue('--out') ?? join(process.cwd(), 'scripts/ui/.screenshots');
const fixtureFilter = getFlagValue('--fixtures');
const fitToContent = Bun.argv.includes('--fit');

/** Union bounding box of the rendered graph nodes/markers/containers, padded, or null if empty. */
async function graphClip(
  page: import('@playwright/test').Page,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const bounds = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.temporal-flow-node, .flow-marker, .region-container');
    if (nodes.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    // getBoundingClientRect is viewport-relative; page.screenshot({ clip }) is page-relative,
    // so add scroll offsets. Expose the page size to clamp the padded box within bounds.
    return {
      left: left + window.scrollX,
      top: top + window.scrollY,
      right: right + window.scrollX,
      bottom: bottom + window.scrollY,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
    };
  });

  if (!bounds) return null;

  // Clamp every edge independently so width/height always match the padded box actually
  // captured — never a fixed padded span bolted onto a clamped origin.
  const padding = 28;
  const x = Math.max(0, bounds.left - padding);
  const y = Math.max(0, bounds.top - padding);
  const right = Math.min(bounds.pageWidth, bounds.right + padding);
  const bottom = Math.min(bounds.pageHeight, bounds.bottom + padding);
  return { x, y, width: right - x, height: bottom - y };
}
const requestedFixtures = fixtureFilter
  ? fixtureFilter.split(',').map((name) => name.trim())
  : [...new Set(fixtureHistories.map((definition) => definition.fixture))].toSorted();

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();
const failures: string[] = [];

try {
  for (const fixture of requestedFixtures) {
    const projectRoot = new URL(`${fixture}/`, fixturesRoot).pathname;

    if (!(await Bun.file(join(projectRoot, '.temporal-explorer', 'analysis.json')).exists())) {
      console.log(`Skipping ${fixture}: no analysis artifact.`);
      continue;
    }

    const trace = firstHistoryFor(fixture);
    const server = await startExplorerServer({ projectRoot, ...(trace ? { trace } : {}) });

    try {
      await warmUpServer(server.url);
      const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
      const assertNoBrowserErrors = collectBrowserErrors(page);

      await page.goto(server.url, { waitUntil: 'networkidle' });
      await page.getByRole('tab', { name: /Flow/ }).click();
      await page.locator('.flow-stage[data-layout-status="ready"]').waitFor({ timeout: 20_000 });
      // The graph mounts only once ELK positions land; wait for a real node too.
      await page
        .locator('.temporal-flow-node, .flow-marker, .region-container')
        .first()
        .waitFor({ timeout: 20_000 });
      // Let the fitView animation settle before capturing.
      await page.waitForTimeout(600);

      const screenshotPath = join(outputDirectory, `${fixture}.png`);
      const clip = fitToContent ? await graphClip(page) : null;

      if (clip) {
        await page.screenshot({ path: screenshotPath, clip });
      } else {
        await page.locator('.flow-stage').screenshot({ path: screenshotPath });
      }

      console.log(`Wrote ${screenshotPath}`);

      try {
        assertNoBrowserErrors();
      } catch (error) {
        failures.push(`${fixture}: ${error instanceof Error ? error.message : String(error)}`);
      }

      await page.close();
    } finally {
      await server.stop();
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\nBrowser errors detected:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`\nCaptured ${requestedFixtures.length} fixture screenshot(s) to ${outputDirectory}.`);
