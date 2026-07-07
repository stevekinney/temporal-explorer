import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
  type ExecutionOverlayDocument,
  type ExplorerArtifacts,
  type RuntimeTraceDocument,
  type TemporalAnalysisDocument,
} from '@temporal-explorer/schemas';

export type ExampleSummary = {
  id: string;
  title: string;
  description: string;
};

export type ExampleArtifacts = ExampleSummary & {
  artifacts: ExplorerArtifacts;
};

type ArtifactSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: { path: PropertyKey[]; message: string }[] };
      };
};

function isNoEntryError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function getDefaultProjectRoot(): string {
  return fileURLToPath(new URL('../../../../../fixtures/basic-order/', import.meta.url));
}

function getFixturesRoot(): string {
  let currentDirectory = process.cwd();

  while (true) {
    const candidate = join(currentDirectory, 'fixtures');

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return fileURLToPath(new URL('../../../../../fixtures/', import.meta.url));
    }

    currentDirectory = parentDirectory;
  }
}

function getProjectRoot(projectRoot: string | undefined): string {
  return resolve(
    projectRoot ?? process.env['TEMPORAL_EXPLORER_PROJECT'] ?? getDefaultProjectRoot(),
  );
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)
    .join('\n');
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${path} is not valid JSON: ${error.message}`, { cause: error });
    }

    throw error;
  }
}

async function readValidatedArtifact<T>(path: string, schema: ArtifactSchema<T>): Promise<T> {
  const result = schema.safeParse(await readJson(path));
  if (!result.success) {
    throw new Error(`${path} failed schema validation:\n${formatIssues(result.error.issues)}`);
  }

  return result.data;
}

async function readAnalysisArtifact(projectRoot: string): Promise<TemporalAnalysisDocument> {
  return await readValidatedArtifact(
    join(projectRoot, '.temporal-explorer', 'analysis.json'),
    temporalAnalysisDocumentSchema,
  );
}

async function readTraceArtifact(path: string): Promise<RuntimeTraceDocument> {
  return await readValidatedArtifact(path, runtimeTraceDocumentSchema);
}

async function readOverlayArtifact(path: string): Promise<ExecutionOverlayDocument> {
  return await readValidatedArtifact(path, executionOverlayDocumentSchema);
}

async function readArtifactPaths(directory: string, suffix: string): Promise<string[]> {
  let entries: string[];

  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isNoEntryError(error)) return [];

    throw error;
  }

  return entries
    .filter((entry) => entry.endsWith(suffix))
    .toSorted((left, right) => left.localeCompare(right))
    .map((entry) => join(directory, entry));
}

export async function loadExplorerArtifacts(
  projectRootOverride?: string,
): Promise<ExplorerArtifacts> {
  const projectRoot = getProjectRoot(projectRootOverride);
  const artifactDirectory = join(projectRoot, '.temporal-explorer');
  const tracePaths = await readArtifactPaths(join(artifactDirectory, 'histories'), '.trace.json');
  const overlayPaths = await readArtifactPaths(
    join(artifactDirectory, 'overlays'),
    '.overlay.json',
  );

  return {
    // The showcase build sets a friendly name; locally it is the project directory.
    projectName: process.env['TEMPORAL_EXPLORER_PROJECT_NAME'] ?? basename(projectRoot),
    artifactDirectory: '.temporal-explorer',
    analysis: await readAnalysisArtifact(projectRoot),
    traces: await Promise.all(tracePaths.map(readTraceArtifact)),
    overlays: await Promise.all(overlayPaths.map(readOverlayArtifact)),
  };
}

function formatFixtureTitle(fixtureName: string): string {
  return fixtureName
    .split('-')
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ');
}

function summarizeArtifacts(artifacts: ExplorerArtifacts): string {
  const workflowCount = artifacts.analysis.workflows.length;
  const commandCount = artifacts.analysis.workflows.reduce(
    (total, workflow) => total + workflow.temporalCommands.length,
    0,
  );
  const traceCount = artifacts.traces.length;

  return `${workflowCount} workflow${workflowCount === 1 ? '' : 's'}, ${commandCount} command${commandCount === 1 ? '' : 's'}, ${traceCount} trace${traceCount === 1 ? '' : 's'}`;
}

async function listFixtureNames(): Promise<string[]> {
  const fixturesRoot = getFixturesRoot();
  const entries = await readdir(fixturesRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right));
}

export async function loadExampleArtifact(fixtureName: string): Promise<ExampleArtifacts> {
  const fixturesRoot = getFixturesRoot();
  const artifacts = await loadExplorerArtifacts(join(fixturesRoot, fixtureName));

  return {
    id: fixtureName,
    title: formatFixtureTitle(fixtureName),
    description: summarizeArtifacts(artifacts),
    artifacts,
  };
}

export async function loadExampleSummaries(): Promise<ExampleSummary[]> {
  const fixtureNames = await listFixtureNames();

  return await Promise.all(
    fixtureNames.map(async (fixtureName) => {
      const { artifacts: _artifacts, ...summary } = await loadExampleArtifact(fixtureName);
      return summary;
    }),
  );
}

export async function loadExampleArtifacts(): Promise<ExampleArtifacts[]> {
  const fixtureNames = await listFixtureNames();
  return await Promise.all(fixtureNames.map(loadExampleArtifact));
}
