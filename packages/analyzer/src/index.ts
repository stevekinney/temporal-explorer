import { basename, resolve } from 'node:path';

import { Project, type SourceFile } from 'ts-morph';

import type {
  ActivityDefinition,
  Diagnostic,
  TemporalAnalysisDocument,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

import temporalExplorerPackageJson from '../../../package.json';

import { loadConfiguration } from './configuration';
import { getPackageManager, readPackageJson } from './package-metadata';
import { createSourceFileHashes, discoverFiles, hashFile, toProjectPath } from './paths';
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
async function discoverWorkflowModuleFiles(root: string): Promise<string[]> {
  const candidates = await discoverFiles(root, ['**/*.ts']);
  const workflowModules = await Promise.all(
    candidates.map(async (file) => {
      if (
        toProjectPath(root, file)
          .split('/')
          .some((segment) => excludedDirectorySegments.has(segment))
      ) {
        return undefined;
      }

      return workflowValueImportPattern.test(await Bun.file(file).text()) ? file : undefined;
    }),
  );

  return workflowModules.filter((file): file is string => file !== undefined);
}

async function resolveWorkflowFiles(
  root: string,
  options: LoadTemporalExplorerProjectOptions,
  configuration: Awaited<ReturnType<typeof loadConfiguration>>,
): Promise<string[]> {
  if (options.workflowFiles) {
    return options.workflowFiles.map((file) => resolve(root, file));
  }

  const globbed = await discoverFiles(
    root,
    configuration?.temporal?.workflowGlobs ?? workflowGlobs,
  );
  const byContent = await discoverWorkflowModuleFiles(root);

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
  const root = resolve(options.root ?? process.cwd());
  const configuration = await loadConfiguration(resolve(root, 'temporal-explorer.config.ts'));
  const { tsconfigName, outputName } = resolveProjectPaths(options, configuration);

  return {
    root,
    tsconfig: resolve(root, tsconfigName),
    workflowFiles: await resolveWorkflowFiles(root, options, configuration),
    outputDirectory: resolve(root, outputName),
    ...(configuration ? { configuration } : {}),
  };
}

async function createProjectWithSources(
  root: string,
  tsconfig: string,
  workflowFiles: string[],
): Promise<Project> {
  const project = new Project({ tsConfigFilePath: tsconfig });

  for (const workflowFile of workflowFiles) {
    project.addSourceFileAtPathIfExists(workflowFile);
  }

  for (const workerFile of await discoverFiles(root, workerGlobs)) {
    project.addSourceFileAtPathIfExists(workerFile);
  }

  return project;
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

  for (const workflowFile of workflowFiles) {
    for (const sourceFile of resolveDeclaringSourceFiles(
      project.getSourceFileOrThrow(workflowFile),
    )) {
      if (analyzedPaths.has(sourceFile.getFilePath())) {
        continue;
      }

      analyzedPaths.add(sourceFile.getFilePath());
      const analysis = analyzeWorkflowSourceFile(root, sourceFile);
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
  const root = resolve(options.projectRoot);
  const workflowFiles = options.workflowFiles.map((file) => resolve(root, file));
  const tsconfig = resolve(root, options.tsconfig);
  const project = await createProjectWithSources(root, tsconfig, workflowFiles);
  const collected = collectWorkflowAnalysis(project, root, workflowFiles);
  const workers = analyzeWorkerFiles(project, root);
  const diagnostics = [
    ...collected.diagnostics,
    ...noWorkflowsDiagnostic(collected.workflows, workers),
  ];
  const packageJson = await readPackageJson(root);
  const sourceFileHashes = await createSourceFileHashes(root, workflowFiles);
  const configHash = await hashFile(tsconfig);
  const temporalTypeScriptVersion = packageJson.dependencies?.['@temporalio/workflow'];
  const packageManager = getPackageManager(packageJson);

  // The project identifier must not depend on process.cwd(); artifacts are
  // committed and regenerated from different working directories.
  const projectName = basename(root);

  return {
    schemaVersion: 'temporal-analysis/v1',
    artifactId: `analysis:${projectName}`,
    metadata: {
      temporalExplorerVersion: temporalExplorerPackageJson.version,
      schemaVersion: 'temporal-analysis/v1',
      inputs: {
        projectRoot: projectName,
        configHash,
        tsconfigHash: configHash,
        sourceFileHashes,
        temporalSdkVersions: temporalTypeScriptVersion
          ? {
              '@temporalio/workflow': temporalTypeScriptVersion,
            }
          : {},
      },
    },
    project: {
      root: projectName,
      tsconfig: toProjectPath(root, tsconfig),
      ...(packageManager ? { packageManager } : {}),
    },
    sdk: {
      ...(temporalTypeScriptVersion ? { temporalTypeScriptVersion } : {}),
      detectedPackages: temporalTypeScriptVersion ? ['@temporalio/workflow'] : [],
    },
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
  });
}
