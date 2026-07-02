import { mkdir, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import {
  analyzeProject,
  createDocumentationSetFromArtifacts,
  createExecutionOverlayFromArtifacts,
  createOverlayReportFromArtifact,
  importHistoryFromFile,
  loadTemporalExplorerProject,
  validateArtifact,
  type DocumentationFile,
  type ExecutionOverlayDocument,
  type RuntimeTraceDocument,
  type TemporalAnalysisDocument,
} from '@temporal-explorer/api';

import type { ParsedFlags } from './arguments';
import { stableJson } from './json-format';

type LoadedAnalysis = {
  analysis: TemporalAnalysisDocument;
  artifactPath: string;
  projectRoot: string;
};

/** Writes an artifact only after it validates against its runtime schema. */
async function writeValidatedArtifact(artifactPath: string, artifact: unknown): Promise<void> {
  const validation = validateArtifact(artifact);

  if (!validation.success) {
    const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`Refusing to write invalid artifact ${artifactPath}:\n${issues}`);
  }

  await Bun.write(artifactPath, stableJson(artifact));
}

export async function writeAnalysisArtifact(
  projectRoot: string,
  analysis: TemporalAnalysisDocument,
): Promise<string> {
  const outputDirectory = join(projectRoot, '.temporal-explorer');
  const artifactPath = join(outputDirectory, 'analysis.json');
  await mkdir(outputDirectory, { recursive: true });
  await writeValidatedArtifact(artifactPath, analysis);
  return artifactPath;
}

export async function writeTraceArtifact(
  projectRoot: string,
  trace: RuntimeTraceDocument,
  traceId: string,
): Promise<string> {
  const outputDirectory = join(projectRoot, '.temporal-explorer', 'histories');
  const artifactPath = join(outputDirectory, `${traceId}.trace.json`);
  await mkdir(outputDirectory, { recursive: true });
  await writeValidatedArtifact(artifactPath, trace);
  return artifactPath;
}

export async function writeOverlayArtifact(
  projectRoot: string,
  overlay: ExecutionOverlayDocument,
  traceId: string,
): Promise<string> {
  const outputDirectory = join(projectRoot, '.temporal-explorer', 'overlays');
  const artifactPath = join(outputDirectory, `${traceId}.overlay.json`);
  await mkdir(outputDirectory, { recursive: true });
  await writeValidatedArtifact(artifactPath, overlay);
  return artifactPath;
}

async function readJsonFile(path: string): Promise<unknown> {
  return await Bun.file(path).json();
}

function isNoEntryError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function readJsonArtifacts(directory: string, suffix: string): Promise<unknown[]> {
  let entries: string[];

  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isNoEntryError(error)) return [];

    throw error;
  }

  return await Promise.all(
    entries
      .filter((entry) => entry.endsWith(suffix))
      .toSorted((left, right) => left.localeCompare(right))
      .map((entry) => readJsonFile(join(directory, entry))),
  );
}

export async function loadAnalysis(flags: ParsedFlags): Promise<LoadedAnalysis> {
  const project = await loadTemporalExplorerProject(flags.project ? { root: flags.project } : {});
  const result = await analyzeProject(project);
  const artifactPath = await writeAnalysisArtifact(project.root, result.value);

  return {
    analysis: result.value,
    artifactPath,
    projectRoot: project.root,
  };
}

export async function loadOverlay(
  flags: ParsedFlags,
  workflowName: string,
): Promise<{
  overlay: ExecutionOverlayDocument;
  artifactPath: string;
}> {
  if (!flags.history) {
    throw new Error('trace requires --history.');
  }

  const projectRoot = resolve(flags.project ?? process.cwd());
  const analysisArtifact = await readJsonFile(
    join(projectRoot, '.temporal-explorer', 'analysis.json'),
  );
  const traceArtifact = await readJsonFile(
    join(projectRoot, '.temporal-explorer', 'histories', `${flags.history}.trace.json`),
  );
  const result = createExecutionOverlayFromArtifacts({
    analysisArtifact,
    traceArtifact,
    workflowName,
  });
  const artifactPath = await writeOverlayArtifact(projectRoot, result.value, flags.history);

  return {
    overlay: result.value,
    artifactPath,
  };
}

export async function loadReport(flags: ParsedFlags): Promise<string> {
  if (!flags.trace) {
    throw new Error('report requires --trace.');
  }

  const projectRoot = resolve(flags.project ?? process.cwd());
  const overlayArtifact = await readJsonFile(
    join(projectRoot, '.temporal-explorer', 'overlays', `${flags.trace}.overlay.json`),
  );
  return createOverlayReportFromArtifact(overlayArtifact);
}

function getTraceId(file: string): string {
  return basename(file, '.json');
}

export async function loadTrace(flags: ParsedFlags): Promise<{
  trace: RuntimeTraceDocument;
  artifactPath: string;
}> {
  if (!flags.file) {
    throw new Error('history import requires --file.');
  }

  const projectRoot = resolve(flags.project ?? process.cwd());
  const result = await importHistoryFromFile({
    projectRoot,
    file: flags.file,
    importedFrom: 'file',
    traceId: getTraceId(flags.file),
  });
  const artifactPath = await writeTraceArtifact(projectRoot, result.value, getTraceId(flags.file));

  return {
    trace: result.value,
    artifactPath,
  };
}

export async function writeDocumentationArtifacts(flags: ParsedFlags): Promise<{
  files: DocumentationFile[];
  outputDirectory: string;
}> {
  const { analysis, projectRoot } = await loadAnalysis(flags);
  const traceArtifacts = await readJsonArtifacts(
    join(projectRoot, '.temporal-explorer', 'histories'),
    '.trace.json',
  );
  const overlayArtifacts = await readJsonArtifacts(
    join(projectRoot, '.temporal-explorer', 'overlays'),
    '.overlay.json',
  );
  const result = createDocumentationSetFromArtifacts({
    analysisArtifact: analysis,
    traceArtifacts,
    overlayArtifacts,
  });
  const outputDirectory = join(projectRoot, '.temporal-explorer', 'docs');

  await mkdir(outputDirectory, { recursive: true });

  for (const documentationFile of result.value) {
    await Bun.write(join(outputDirectory, documentationFile.path), documentationFile.contents);
  }

  return {
    files: result.value,
    outputDirectory,
  };
}
