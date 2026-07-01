import { readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  temporalAnalysisDocumentSchema,
  type ExecutionOverlayDocument,
  type RuntimeTraceDocument,
  type TemporalAnalysisDocument,
} from '@temporal-explorer/schemas';

export type ExplorerArtifacts = {
  projectName: string;
  artifactDirectory: string;
  analysis: TemporalAnalysisDocument;
  traces: RuntimeTraceDocument[];
  overlays: ExecutionOverlayDocument[];
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
    projectName: basename(projectRoot),
    artifactDirectory: '.temporal-explorer',
    analysis: await readAnalysisArtifact(projectRoot),
    traces: await Promise.all(tracePaths.map(readTraceArtifact)),
    overlays: await Promise.all(overlayPaths.map(readOverlayArtifact)),
  };
}
