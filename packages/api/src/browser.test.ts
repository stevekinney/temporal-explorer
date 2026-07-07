import { describe, expect, it } from 'bun:test';

import { createExplorerBundle, InMemoryFileSource } from './browser';

const fixtureRoot = new URL('../../../fixtures/basic-order', import.meta.url).pathname;

async function readFixtureFileEntries(
  fixtureName: string,
): Promise<{ path: string; contents: string }[]> {
  const fixtureDirectory = new URL(`../../../fixtures/${fixtureName}/`, import.meta.url).pathname;
  const virtualRoot = `/project/${fixtureName}`;
  const glob = new Bun.Glob('**/*');
  const entries: { path: string; contents: string }[] = [];

  for await (const relativePath of glob.scan({ cwd: fixtureDirectory, onlyFiles: true })) {
    entries.push({
      path: `${virtualRoot}/${relativePath}`,
      contents: await Bun.file(`${fixtureDirectory}${relativePath}`).text(),
    });
  }

  return entries;
}

describe('browser Explorer bundles', () => {
  it('creates a static-only Explorer bundle from browser file entries', async () => {
    const result = await createExplorerBundle({
      root: '/project/basic-order',
      projectName: 'basic-order',
      files: await readFixtureFileEntries('basic-order'),
    });

    expect(result.value.projectName).toBe('basic-order');
    expect(result.value.analysis.workflows.map((workflow) => workflow.name)).toEqual([
      'basicOrderWorkflow',
    ]);
    expect(result.value.traces).toEqual([]);
    expect(result.value.overlays).toEqual([]);
  });

  it('defaults bundle roots to a supplied file source', async () => {
    const fixtureFiles = await readFixtureFileEntries('basic-order');
    const fileSource = new InMemoryFileSource(
      fixtureFiles.map((file) => [file.path, file.contents]),
      '/project/basic-order',
    );
    const result = await createExplorerBundle({
      fileSource,
      projectName: 'basic-order',
    });

    expect(result.value.analysis.project.tsconfig).toBe('tsconfig.json');
    expect(Object.keys(result.value.analysis.metadata.inputs.sourceFileHashes)).toEqual([
      'src/workflows/basic-order-workflow.ts',
    ]);
    expect(result.value.analysis.workflows.map((workflow) => workflow.name)).toEqual([
      'basicOrderWorkflow',
    ]);
  });

  it('creates a history-enhanced Explorer bundle from browser file entries', async () => {
    const result = await createExplorerBundle({
      root: '/project/basic-order',
      projectName: 'basic-order',
      files: await readFixtureFileEntries('basic-order'),
      history: await Bun.file(`${fixtureRoot}/histories/success.json`).json(),
      workflowName: 'basicOrderWorkflow',
    });

    expect(result.value.traces).toHaveLength(1);
    expect(result.value.overlays).toHaveLength(1);
    expect(result.value.overlays[0]?.coverage.nodes.unmappedRuntimeOperations).toBe(0);
  });

  it('reports history diagnostics from browser Explorer bundles', async () => {
    const result = await createExplorerBundle({
      root: '/project/basic-order',
      projectName: 'basic-order',
      files: await readFixtureFileEntries('basic-order'),
      history: {
        events: [
          {
            eventId: 1,
            eventTime: '2026-01-01T00:00:00.001Z',
            eventType: 1,
            workflowExecutionStartedEventAttributes: {
              workflowType: { name: 'basicOrderWorkflow' },
              originalExecutionRunId: 'basic-order-run-id',
            },
          },
          {
            eventId: 2,
            eventTime: '2026-01-01T00:00:00.002Z',
            eventType: 999,
          },
        ],
      },
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'TEH_UNKNOWN_EVENT_TYPE',
    );
  });
});
