import type { Project, SourceFile } from 'ts-morph';

import type {
  ActivityDefinition,
  Diagnostic,
  TemporalAnalysisDocument,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import {
  createAnalysisMetadata,
  createProjectMetadata,
  createSdkMetadata,
  hashExistingTsconfig,
} from './analysis-document';
import { loadConfiguration } from './configuration';
import {
  BunFileSource,
  createSourceFileHashes as createSourceFileHashesForSource,
  type FileSource,
} from './file-source';
import { getPackageManager, readPackageJsonFromFileSource } from './package-metadata';
import { normalizeProjectPath, resolveProjectPath, toProjectPath } from './paths';
import type {
  AnalyzeWorkflowFilesOptions,
  LoadTemporalExplorerProjectOptions,
  TemporalExplorerProject,
} from './types';
import { analyzeWorkerFiles, analyzeWorkflowSourceFile } from './workflow-analysis';

export {
  applySeverityOverrides,
  defineConfig,
  type DiagnosticSeverityOverride,
  type TemporalConnectionProfile,
  type TemporalExplorerConfiguration,
} from './configuration';
export { BunFileSource, InMemoryFileSource, type FileSource } from './file-source';
export { createSourceFileHashes, toProjectPath } from './paths';
export type {
  AnalyzeWorkflowFilesOptions,
  LoadTemporalExplorerProjectOptions,
  TemporalExplorerProject,
} from './types';

// `src/workflows.ts` (a flat file) is the dominant convention in real
// Temporal TypeScript projects, including temporalio/samples-typescript. The
// `src/` segment isn't always at the project root either (e.g. an app nested
// under apps/worker/src/...), so the leading `**/` lets it appear anywhere.
const workflowGlobs = [
  '**/src/**/workflows/**/*.ts',
  '**/src/**/*.workflow.ts',
  '**/src/**/workflows.ts',
];
const workerGlobs = ['**/src/**/worker*.ts', '**/src/**/workers/**/*.ts'];

// A value import (not `import type`) of `@temporalio/workflow` is the defining
// signal of a Workflow module: only sandboxed Workflow code calls the module's
// runtime helpers (proxyActivities, sleep, condition, defineSignal, ...).
// Activities, clients, and workers import different `@temporalio/*` entrypoints.
const workflowValueImportPattern = /import\s+(?!type\s)[^;'"]*from\s*['"]@temporalio\/workflow['"]/;
const excludedDirectorySegments = new Set(['dist', 'build', '.temporal-explorer']);

/**
 * Discovers Workflow modules by content: any `.ts` file with a value import of
 * `@temporalio/workflow`. This complements the filename globs so Workflows in
 * non-conventional locations (a `cancellation-scopes.ts`, a flat root file, or
 * a monorepo `packages/workflows/*.ts`) are found instead of silently skipped.
 */
function basename(path: string): string {
  const segments = normalizeProjectPath(path).split('/');
  return segments.at(-1) ?? path;
}

async function discoverWorkflowModuleFiles(source: FileSource): Promise<string[]> {
  const candidates = await source.list(['**/*.ts']);
  const workflowModules = await Promise.all(
    candidates.map(async (file) => {
      if (
        toProjectPath(source.root, file)
          .split('/')
          .some((segment) => excludedDirectorySegments.has(segment))
      ) {
        return undefined;
      }

      return workflowValueImportPattern.test(await source.read(file)) ? file : undefined;
    }),
  );

  return workflowModules.filter((file): file is string => file !== undefined);
}

async function resolveWorkflowFiles(
  root: string,
  source: FileSource,
  options: LoadTemporalExplorerProjectOptions,
  configuration: Awaited<ReturnType<typeof loadConfiguration>>,
): Promise<string[]> {
  if (options.workflowFiles) {
    return options.workflowFiles.map((file) => resolveProjectPath(root, file));
  }

  const globbed = await source.list(configuration?.temporal?.workflowGlobs ?? workflowGlobs);
  const byContent = await discoverWorkflowModuleFiles(source);

  return [...new Set([...globbed, ...byContent])].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function resolveProjectPaths(
  options: LoadTemporalExplorerProjectOptions,
  configuration: Awaited<ReturnType<typeof loadConfiguration>>,
): { tsconfigName: string; outputName: string } {
  return {
    tsconfigName: options.tsconfig ?? configuration?.tsconfig ?? 'tsconfig.json',
    outputName: options.outputDirectory ?? configuration?.output?.directory ?? '.temporal-explorer',
  };
}

export async function loadTemporalExplorerProject(
  options: LoadTemporalExplorerProjectOptions = {},
): Promise<TemporalExplorerProject> {
  const root = normalizeProjectPath(options.root ?? process.cwd());
  const fileSource = options.fileSource ?? new BunFileSource(root);
  const configuration = options.fileSource
    ? undefined
    : await loadConfiguration(resolveProjectPath(root, 'temporal-explorer.config.ts'));
  const { tsconfigName, outputName } = resolveProjectPaths(options, configuration);

  return {
    root,
    tsconfig: resolveProjectPath(root, tsconfigName),
    workflowFiles: await resolveWorkflowFiles(root, fileSource, options, configuration),
    outputDirectory: resolveProjectPath(root, outputName),
    fileSource,
    ...(configuration ? { configuration } : {}),
  };
}

async function createProjectWithSources(
  source: FileSource,
  tsconfig: string | undefined,
  workflowFiles: string[],
): Promise<Project> {
  return await source.createProject(tsconfig, [
    ...workflowFiles,
    ...(await source.list(workerGlobs)),
  ]);
}

/**
 * Expands a matched workflow file to the source files that actually declare
 * its exported Workflows. Re-export barrels (`export { x } from './v3'`) are
 * a common Temporal versioning convention; the declaring files carry the
 * analyzable function bodies.
 */
function resolveDeclaringSourceFiles(sourceFile: SourceFile): SourceFile[] {
  const files = new Map<string, SourceFile>([[sourceFile.getFilePath(), sourceFile]]);

  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    const target = exportDeclaration.getModuleSpecifierSourceFile();

    if (target) {
      files.set(target.getFilePath(), target);
    }
  }

  return [...files.values()];
}

/**
 * Maps each declaring file to its `{ implementationName -> registeredName }`
 * aliases from re-export barrels (`export { impl as Registered } from './base'`).
 *
 * A Temporal Worker registers a Workflow under the name it is *exported* as, so
 * an aliased re-export changes the runtime Workflow name while the underlying
 * implementation function keeps its own name (used for the Workflow `id`,
 * command IDs, and source location). Keying by the resolved target file — rather
 * than threading aliases through re-export resolution — keeps the mapping
 * order-independent and scoped to the file that declares each implementation.
 */
function collectRegisteredNamesByFile(project: Project): Map<string, Map<string, string>> {
  const byFile = new Map<string, Map<string, string>>();

  for (const sourceFile of project.getSourceFiles()) {
    for (const exportDeclaration of sourceFile.getExportDeclarations()) {
      const target = exportDeclaration.getModuleSpecifierSourceFile() ?? sourceFile;
      const targetPath = target.getFilePath();

      for (const specifier of exportDeclaration.getNamedExports()) {
        const alias = specifier.getAliasNode()?.getText();

        if (!alias) {
          continue;
        }

        const names = byFile.get(targetPath) ?? new Map<string, string>();

        // First registration wins so the mapping stays stable regardless of the
        // order source files are visited.
        if (!names.has(specifier.getName())) {
          names.set(specifier.getName(), alias);
        }

        byFile.set(targetPath, names);
      }
    }
  }

  return byFile;
}

function collectWorkflowAnalysis(
  project: Project,
  root: string,
  workflowFiles: string[],
): {
  workflows: WorkflowDefinition[];
  activities: ActivityDefinition[];
  diagnostics: Diagnostic[];
} {
  const workflows: WorkflowDefinition[] = [];
  const activities: ActivityDefinition[] = [];
  const diagnostics: Diagnostic[] = [];
  const analyzedPaths = new Set<string>();
  const registeredNamesByFile = collectRegisteredNamesByFile(project);

  for (const workflowFile of workflowFiles) {
    for (const sourceFile of resolveDeclaringSourceFiles(
      project.getSourceFileOrThrow(workflowFile),
    )) {
      if (analyzedPaths.has(sourceFile.getFilePath())) {
        continue;
      }

      analyzedPaths.add(sourceFile.getFilePath());
      const analysis = analyzeWorkflowSourceFile(
        root,
        sourceFile,
        registeredNamesByFile.get(sourceFile.getFilePath()) ?? new Map(),
      );
      workflows.push(...analysis.workflows);
      activities.push(...analysis.activities);
      diagnostics.push(...analysis.diagnostics);
    }
  }

  return { workflows, activities, diagnostics };
}

/**
 * Flags the silent-empty case: a project registers a Worker but no Workflow
 * functions were discovered, usually because the Workflows live in a location
 * the discovery could not reach. Better a visible warning than a blank result.
 */
function noWorkflowsDiagnostic(workflows: WorkflowDefinition[], workers: unknown[]): Diagnostic[] {
  if (workflows.length > 0 || workers.length === 0) {
    return [];
  }

  return [
    {
      code: 'TEA_NO_WORKFLOWS_FOUND',
      category: 'discovery',
      severity: 'warning',
      message:
        'A Worker was detected but no Workflow functions were discovered. Check the Workflow file location or configure `workflowGlobs`.',
      confidence: 'exact',
    },
  ];
}

export async function analyzeWorkflowFiles(
  options: AnalyzeWorkflowFilesOptions,
): Promise<TemporalAnalysisDocument> {
  const root = normalizeProjectPath(options.projectRoot);
  const source = options.fileSource ?? new BunFileSource(root);
  const workflowFiles = options.workflowFiles.map((file) => resolveProjectPath(root, file));
  const tsconfig = options.tsconfig ? resolveProjectPath(root, options.tsconfig) : undefined;
  const project = await createProjectWithSources(source, tsconfig, workflowFiles);
  const collected = collectWorkflowAnalysis(project, root, workflowFiles);
  const workers = analyzeWorkerFiles(project, root);
  const diagnostics = [
    ...collected.diagnostics,
    ...noWorkflowsDiagnostic(collected.workflows, workers),
  ];
  const packageJson = await readPackageJsonFromFileSource(source);
  const sourceFileHashes = await createSourceFileHashesForSource(source, workflowFiles);
  const configHash = await hashExistingTsconfig(source, tsconfig);
  const temporalTypeScriptVersion = packageJson.dependencies?.['@temporalio/workflow'];
  const packageManager = getPackageManager(packageJson);

  // The project identifier must not depend on process.cwd(); artifacts are
  // committed and regenerated from different working directories.
  const projectName = basename(root);

  return {
    schemaVersion: 'temporal-analysis/v1',
    artifactId: `analysis:${projectName}`,
    metadata: createAnalysisMetadata({
      projectName,
      configHash,
      sourceFileHashes,
      temporalTypeScriptVersion,
    }),
    project: createProjectMetadata({
      projectName,
      tsconfigPath: tsconfig ? toProjectPath(root, tsconfig) : '',
      packageManager,
    }),
    sdk: createSdkMetadata(temporalTypeScriptVersion),
    workers,
    workflows: collected.workflows,
    activities: collected.activities,
    clients: [],
    diagnostics,
  };
}

export async function analyzeProject(
  project: TemporalExplorerProject,
): Promise<TemporalAnalysisDocument> {
  return await analyzeWorkflowFiles({
    projectRoot: project.root,
    tsconfig: project.tsconfig,
    workflowFiles: project.workflowFiles,
    outputDirectory: project.outputDirectory,
    ...(project.fileSource ? { fileSource: project.fileSource } : {}),
  });
}
