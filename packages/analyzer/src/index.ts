import { basename, resolve } from 'node:path';

import { Project } from 'ts-morph';

import type {
  ActivityDefinition,
  Diagnostic,
  TemporalAnalysisDocument,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

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

const workflowGlobs = ['src/**/workflows/**/*.ts', 'src/**/*.workflow.ts'];
const workerGlobs = ['src/**/worker*.ts', 'src/**/workers/**/*.ts'];

async function resolveWorkflowFiles(
  root: string,
  options: LoadTemporalExplorerProjectOptions,
  configuration: Awaited<ReturnType<typeof loadConfiguration>>,
): Promise<string[]> {
  if (options.workflowFiles) {
    return options.workflowFiles.map((file) => resolve(root, file));
  }

  return await discoverFiles(root, configuration?.temporal?.workflowGlobs ?? workflowGlobs);
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

  for (const workflowFile of workflowFiles) {
    const analysis = analyzeWorkflowSourceFile(root, project.getSourceFileOrThrow(workflowFile));
    workflows.push(...analysis.workflows);
    activities.push(...analysis.activities);
    diagnostics.push(...analysis.diagnostics);
  }

  return { workflows, activities, diagnostics };
}

export async function analyzeWorkflowFiles(
  options: AnalyzeWorkflowFilesOptions,
): Promise<TemporalAnalysisDocument> {
  const root = resolve(options.projectRoot);
  const workflowFiles = options.workflowFiles.map((file) => resolve(root, file));
  const tsconfig = resolve(root, options.tsconfig);
  const project = await createProjectWithSources(root, tsconfig, workflowFiles);
  const collected = collectWorkflowAnalysis(project, root, workflowFiles);
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
      temporalExplorerVersion: '0.0.0-mvp',
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
    workers: analyzeWorkerFiles(project, root),
    workflows: collected.workflows,
    activities: collected.activities,
    clients: [],
    diagnostics: collected.diagnostics,
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
