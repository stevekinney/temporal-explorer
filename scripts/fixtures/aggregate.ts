/**
 * Builds a single synthetic explorer project from every committed fixture.
 *
 * The explorer shows one project at a time — a single `.temporal-explorer`
 * directory whose `analysis.json` drives the workflow sidebar. Each fixture is
 * its own single-workflow project, so this merges every fixture's committed
 * artifacts into one schema-valid analysis document and copies every trace and
 * overlay alongside it (namespaced by fixture to avoid filename collisions).
 * The explorer matches traces and overlays to workflows by content — workflow
 * name and trace id — not by filename, so every fixture renders correctly and
 * appears together in the sidebar.
 *
 * Both the local `explorer:fixtures` dev server and the Vercel showcase build
 * consume this so the aggregate is produced exactly one way.
 */
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  temporalAnalysisDocumentSchema,
  type TemporalAnalysisDocument,
} from '@temporal-explorer/schemas';

const repoRoot = new URL('../../', import.meta.url).pathname;
const fixturesRoot = join(repoRoot, 'fixtures');

export type AggregateSummary = {
  fixtures: number;
  workflows: number;
  traces: number;
  overlays: number;
};

/** Fixture directory names that carry a committed `analysis.json`, sorted. */
async function discoverFixtures(): Promise<string[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  const fixtures: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const analysis = join(fixturesRoot, entry.name, '.temporal-explorer', 'analysis.json');
    if (await Bun.file(analysis).exists()) fixtures.push(entry.name);
  }

  return fixtures.toSorted();
}

/** Collects items into a Map keyed by `id`, keeping the first occurrence of each. */
function collectById<T extends { id: string }>(into: Map<string, T>, items: T[] | undefined): void {
  for (const item of items ?? []) {
    if (!into.has(item.id)) into.set(item.id, item);
  }
}

/** Merges every fixture's analysis document into one schema-valid project document. */
async function buildMergedAnalysis(fixtures: string[]): Promise<TemporalAnalysisDocument> {
  const docs = await Promise.all(
    fixtures.map((fixture) =>
      Bun.file(join(fixturesRoot, fixture, '.temporal-explorer', 'analysis.json')).json(),
    ),
  );

  const base = docs[0];
  if (!base) throw new Error('No fixture analysis documents to merge.');

  const activities = new Map<string, { id: string }>();
  const workers = new Map<string, { id: string }>();
  const clients = new Map<string, { id: string }>();
  for (const doc of docs) {
    collectById(activities, doc.activities);
    collectById(workers, doc.workers);
    collectById(clients, doc.clients);
  }

  const merged = {
    ...base,
    artifactId: 'analysis:all-fixtures',
    project: { root: 'all-fixtures', tsconfig: 'tsconfig.json' },
    workflows: docs.flatMap((doc) => doc.workflows),
    activities: [...activities.values()],
    workers: [...workers.values()],
    clients: [...clients.values()],
    diagnostics: docs.flatMap((doc) => doc.diagnostics ?? []),
  };

  const parsed = temporalAnalysisDocumentSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(
      `Merged analysis failed schema validation:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
    );
  }

  return parsed.data;
}

/** Copies each fixture's runtime artifacts of one kind into the aggregate, namespaced by fixture. */
async function copyRuntimeArtifacts(
  artifactDirectory: string,
  fixtures: string[],
  subdirectory: string,
  suffix: string,
): Promise<number> {
  const destination = join(artifactDirectory, subdirectory);
  await mkdir(destination, { recursive: true });
  let copied = 0;

  for (const fixture of fixtures) {
    const source = join(fixturesRoot, fixture, '.temporal-explorer', subdirectory);
    let entries: string[];
    try {
      entries = await readdir(source);
    } catch {
      continue; // Fixture has no artifacts of this kind.
    }

    for (const entry of entries) {
      if (!entry.endsWith(suffix)) continue;
      await Bun.write(join(destination, `${fixture}__${entry}`), Bun.file(join(source, entry)));
      copied += 1;
    }
  }

  return copied;
}

/**
 * Rebuilds the aggregate project at `outputRoot` from scratch and returns a
 * summary of what was loaded. `outputRoot` becomes an explorer project root: it
 * gets a `.temporal-explorer` directory, and its basename is the project name.
 */
export async function buildAggregate(outputRoot: string): Promise<AggregateSummary> {
  const artifactDirectory = join(outputRoot, '.temporal-explorer');
  const fixtures = await discoverFixtures();
  if (fixtures.length === 0) {
    throw new Error(`No fixtures with committed artifacts found under ${fixturesRoot}.`);
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(artifactDirectory, { recursive: true });

  const analysis = await buildMergedAnalysis(fixtures);
  await Bun.write(
    join(artifactDirectory, 'analysis.json'),
    `${JSON.stringify(analysis, null, 2)}\n`,
  );

  const traces = await copyRuntimeArtifacts(
    artifactDirectory,
    fixtures,
    'histories',
    '.trace.json',
  );
  const overlays = await copyRuntimeArtifacts(
    artifactDirectory,
    fixtures,
    'overlays',
    '.overlay.json',
  );

  return { fixtures: fixtures.length, workflows: analysis.workflows.length, traces, overlays };
}
