import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { loadExplorerArtifacts } from './artifacts';

const fixtureRoot = new URL('../../../../../fixtures/basic-order/', import.meta.url).pathname;
const analysisArtifactPath = join(fixtureRoot, '.temporal-explorer', 'analysis.json');
const traceArtifactPath = join(
  fixtureRoot,
  '.temporal-explorer',
  'histories',
  'success.trace.json',
);
const overlayArtifactPath = join(
  fixtureRoot,
  '.temporal-explorer',
  'overlays',
  'success.overlay.json',
);

async function createArtifactProject(analysis: unknown): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'temporal-explorer-artifacts-'));
  const artifactDirectory = join(projectRoot, '.temporal-explorer');
  await mkdir(artifactDirectory, { recursive: true });
  await Bun.write(join(artifactDirectory, 'analysis.json'), JSON.stringify(analysis));
  return projectRoot;
}

async function expectArtifactLoadFailure(
  projectRoot: string,
  expectedMessage: string,
): Promise<void> {
  try {
    await loadExplorerArtifacts(projectRoot);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw new Error('Expected artifact loading to fail with an Error instance.', {
        cause: error,
      });
    }

    expect(error.message).toContain(expectedMessage);
    return;
  }

  throw new Error(`Expected artifact loading to fail with ${expectedMessage}.`);
}

describe('explorer artifact loader', () => {
  it('loads committed fixture artifacts without analyzer internals', async () => {
    const artifacts = await loadExplorerArtifacts(fixtureRoot);

    expect(artifacts.projectName).toBe('basic-order');
    expect(artifacts.analysis.workflows.map((workflow) => workflow.name)).toEqual([
      'basicOrderWorkflow',
    ]);
    expect(artifacts.traces[0]?.execution.workflowType).toBe('basicOrderWorkflow');
    expect(artifacts.overlays[0]?.coverage.nodes.unmappedRuntimeOperations).toBe(0);
  });

  it('loads the module-relative default fixture project', async () => {
    const previousProject = process.env['TEMPORAL_EXPLORER_PROJECT'];

    delete process.env['TEMPORAL_EXPLORER_PROJECT'];

    try {
      const artifacts = await loadExplorerArtifacts();

      expect(artifacts.projectName).toBe('basic-order');
    } finally {
      if (previousProject === undefined) {
        delete process.env['TEMPORAL_EXPLORER_PROJECT'];
      } else {
        process.env['TEMPORAL_EXPLORER_PROJECT'] = previousProject;
      }
    }
  });

  it('treats missing trace and overlay directories as empty artifact lists', async () => {
    const projectRoot = await createArtifactProject(await Bun.file(analysisArtifactPath).json());
    const artifacts = await loadExplorerArtifacts(projectRoot);

    expect(artifacts.traces).toEqual([]);
    expect(artifacts.overlays).toEqual([]);
  });

  it('loads trace and overlay artifacts in deterministic filename order', async () => {
    const projectRoot = await createArtifactProject(await Bun.file(analysisArtifactPath).json());
    const historiesDirectory = join(projectRoot, '.temporal-explorer', 'histories');
    const overlaysDirectory = join(projectRoot, '.temporal-explorer', 'overlays');
    const traceArtifact = JSON.stringify(await Bun.file(traceArtifactPath).json());
    const overlayArtifact = JSON.stringify(await Bun.file(overlayArtifactPath).json());

    await mkdir(historiesDirectory, { recursive: true });
    await mkdir(overlaysDirectory, { recursive: true });
    await Bun.write(join(historiesDirectory, 'b.trace.json'), traceArtifact);
    await Bun.write(join(historiesDirectory, 'a.trace.json'), traceArtifact);
    await Bun.write(join(overlaysDirectory, 'b.overlay.json'), overlayArtifact);
    await Bun.write(join(overlaysDirectory, 'a.overlay.json'), overlayArtifact);

    const artifacts = await loadExplorerArtifacts(projectRoot);

    expect(artifacts.traces).toHaveLength(2);
    expect(artifacts.overlays).toHaveLength(2);
  });

  it('reports invalid JSON and schema validation failures', async () => {
    const missingAnalysisProjectRoot = await mkdtemp(
      join(tmpdir(), 'temporal-explorer-missing-analysis-artifact-'),
    );
    const invalidJsonProjectRoot = await mkdtemp(join(tmpdir(), 'temporal-explorer-invalid-json-'));
    const invalidJsonArtifactDirectory = join(invalidJsonProjectRoot, '.temporal-explorer');
    await mkdir(invalidJsonArtifactDirectory, { recursive: true });
    await Bun.write(join(invalidJsonArtifactDirectory, 'analysis.json'), '{');

    await expectArtifactLoadFailure(missingAnalysisProjectRoot, 'analysis.json');
    await expectArtifactLoadFailure(invalidJsonProjectRoot, 'is not valid JSON:');

    const invalidSchemaProjectRoot = await createArtifactProject({
      schemaVersion: 'temporal-analysis/v1',
      artifactId: 'broken',
    });

    await expectArtifactLoadFailure(invalidSchemaProjectRoot, 'failed schema validation:');
  });
});
