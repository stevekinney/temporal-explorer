/**
 * Geometry gate: renders each fixture's Flow view and asserts, from the real rendered
 * node rectangles and edge topology, that the graph is laid out sanely.
 *
 * Two deterministic checks that map to real bugs the nested-container renderer risks:
 *  - OVERLAP: no two content nodes (activity/marker cards, not region containers) overlap.
 *    Containers legitimately enclose their children, so only content-vs-content pairs count.
 *  - ORPHAN: every node is touched by at least one edge. A parentless, edgeless node floats
 *    off on its own (the dynamic fan-out bug looked exactly like this).
 *
 * Numeric pass/fail is far more trustworthy than eyeballing a `fitView`-shrunk canvas, and
 * it runs across ALL fixtures because a renderer fix can regress a currently-good one.
 *
 * Usage: bun run scripts/ui/graph-geometry.ts [--fixtures a,b,c]
 */
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { chromium } from '@playwright/test';

import { startExplorerServer } from '../../packages/cli/src/open-server';
import { fixtureHistories } from '../fixtures/manifest';
import { warmUpServer } from './warm-up-server';

const fixturesRoot = new URL('../../fixtures/', import.meta.url);

function getFlagValue(flag: string): string | undefined {
  const index = Bun.argv.indexOf(flag);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

// The rendered node/edge geometry comes back from `page.evaluate` as plain serialized data,
// so `role` widens to `string`. These helpers only need the rectangle, not the role union.
type Box = { x: number; y: number; right: number; bottom: number };

function overlapArea(a: Box, b: Box): number {
  const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function area(box: Box): number {
  return (box.right - box.x) * (box.bottom - box.y);
}

const fixtureFilter = getFlagValue('--fixtures');
const fixtures = fixtureFilter
  ? fixtureFilter.split(',').map((name) => name.trim())
  : [...new Set(fixtureHistories.map((definition) => definition.fixture))].toSorted();

const browser = await chromium.launch();
const failures: string[] = [];

try {
  for (const fixture of fixtures) {
    const projectRoot = new URL(`${fixture}/`, fixturesRoot).pathname;
    if (!(await Bun.file(`${projectRoot}.temporal-explorer/analysis.json`).exists())) continue;

    const trace = fixtureHistories.find((definition) => definition.fixture === fixture)?.history;
    const server = await startExplorerServer({ projectRoot, ...(trace ? { trace } : {}) });

    try {
      await warmUpServer(server.url);
      const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
      await page.goto(server.url, { waitUntil: 'networkidle' });
      await page.getByRole('tab', { name: /Flow/ }).click();
      await page.locator('.flow-stage[data-layout-status="ready"]').waitFor({ timeout: 20_000 });
      await page.locator('.temporal-flow-node, .flow-marker, .region-container').first().waitFor();
      await page.waitForTimeout(500);

      const { nodes, edgeEndpoints, viewport } = await page.evaluate(() => {
        const flow = document.querySelector('.temporal-flow');
        const flowRect = flow?.getBoundingClientRect();
        const flowViewport = flowRect
          ? {
              left: flowRect.left,
              top: flowRect.top,
              right: flowRect.right,
              bottom: flowRect.bottom,
            }
          : null;
        const nodeElements = Array.from(
          document.querySelectorAll<HTMLElement>('[data-flow-node-id]'),
        );
        const nodeBoxes = nodeElements.map((element) => {
          const rect = element.getBoundingClientRect();
          const role = element.querySelector('.region-container')
            ? 'container'
            : element.querySelector('.flow-marker')
              ? 'marker'
              : element.querySelector('.temporal-flow-node')
                ? 'card'
                : 'unknown';
          return {
            id: element.getAttribute('data-flow-node-id') ?? '',
            role,
            x: rect.x,
            y: rect.y,
            right: rect.right,
            bottom: rect.bottom,
          };
        });
        const endpointIds = new Set<string>();
        for (const element of document.querySelectorAll('[data-flow-edge-id]')) {
          const id = element.getAttribute('data-flow-edge-id') ?? '';
          // Edge ids come in two shapes: control-flow edges are `edge:<n>:source->target`
          // and message-surface/scope/sequential edges are `edge:source->target`. Strip the
          // `edge:` prefix and an optional numeric counter, then split on the `->` arrow
          // (node ids never contain one).
          const body = id.replace(/^edge:(\d+:)?/, '');
          const arrow = body.indexOf('->');
          if (arrow >= 0) {
            endpointIds.add(body.slice(0, arrow));
            endpointIds.add(body.slice(arrow + 2));
          }
        }
        return { nodes: nodeBoxes, edgeEndpoints: [...endpointIds], viewport: flowViewport };
      });

      const endpoints = new Set(edgeEndpoints);
      const problems: string[] = [];

      // Clipping: every content node must sit inside the flow pane. `fitView` should frame the
      // whole graph, but a too-high `minZoom` floor stops it zooming out far enough for a wide
      // graph, leaving nodes cut off at the edges. The overlap/orphan checks are blind to this
      // (a clipped graph still has valid inter-node geometry), so assert it explicitly.
      if (viewport) {
        const tolerance = 4;
        for (const node of nodes) {
          if (node.role === 'container') continue;
          if (
            node.x < viewport.left - tolerance ||
            node.right > viewport.right + tolerance ||
            node.y < viewport.top - tolerance ||
            node.bottom > viewport.bottom + tolerance
          ) {
            problems.push(`clipped (outside flow pane): ${node.id} [${node.role}]`);
          }
        }
      }

      // Overlap: only content-vs-content (containers legitimately enclose children).
      const content = nodes.filter((node) => node.role === 'card' || node.role === 'marker');
      for (let i = 0; i < content.length; i += 1) {
        const a = content[i];
        if (!a) continue;
        for (let j = i + 1; j < content.length; j += 1) {
          const b = content[j];
          if (!b) continue;
          const overlap = overlapArea(a, b);
          const smaller = Math.min(area(a), area(b));
          // Ignore hairline touches; flag a real collision (>12% of the smaller node).
          if (overlap > 0 && smaller > 0 && overlap / smaller > 0.12) {
            problems.push(`overlap: ${a.id} ∩ ${b.id}`);
          }
        }
      }

      // Orphan: every content node should be an endpoint of at least one edge. Region
      // containers are excluded — they are visual group boxes; edges connect their
      // children (fork/decision/join), never the container itself. A single-node graph
      // (a do-nothing workflow that only returns) has nothing to connect to and is fine.
      const contentCount = nodes.filter((node) => node.role !== 'container').length;
      if (contentCount > 1) {
        for (const node of nodes) {
          if (node.role !== 'container' && !endpoints.has(node.id)) {
            problems.push(`orphan (no edge): ${node.id} [${node.role}]`);
          }
        }
      }

      if (problems.length > 0) {
        failures.push(`${fixture}:\n    ${problems.join('\n    ')}`);
        console.error(`FAIL ${fixture} (${nodes.length} nodes): ${problems.length} problem(s)`);
      } else {
        console.log(`OK   ${fixture} (${nodes.length} nodes)`);
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
  console.error(`\nGeometry problems:\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(
  `\nAll ${fixtures.length} fixture graphs laid out without overlaps, orphans, or clipping.`,
);
