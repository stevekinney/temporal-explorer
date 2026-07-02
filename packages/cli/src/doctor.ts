import { join } from 'node:path';

import {
  createSourceFileHashes,
  loadTemporalExplorerProject,
  toProjectPath,
  type TemporalExplorerProject,
} from '@temporal-explorer/api';

export type DoctorReport = {
  root: string;
  configurationSource: 'temporal-explorer.config.ts' | 'defaults';
  tsconfig: string;
  outputDirectory: string;
  analysisArtifact: 'missing' | 'fresh' | 'stale';
  workflowFiles: { path: string; reason: string }[];
  diagnosticOverrides: Record<string, string>;
  connections: { name: string; address: string; namespace: string }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStoredHashes(artifact: unknown): Record<string, string> | undefined {
  if (!isRecord(artifact) || !isRecord(artifact['metadata'])) {
    return undefined;
  }

  const inputs = artifact['metadata']['inputs'];

  if (!isRecord(inputs) || !isRecord(inputs['sourceFileHashes'])) {
    return undefined;
  }

  const hashes: Record<string, string> = {};

  for (const [path, hash] of Object.entries(inputs['sourceFileHashes'])) {
    if (typeof hash === 'string') {
      hashes[path] = hash;
    }
  }

  return hashes;
}

async function getAnalysisFreshness(
  project: TemporalExplorerProject,
): Promise<DoctorReport['analysisArtifact']> {
  const artifactFile = Bun.file(join(project.root, '.temporal-explorer', 'analysis.json'));

  if (!(await artifactFile.exists())) {
    return 'missing';
  }

  const stored = readStoredHashes(await artifactFile.json());
  const current = await createSourceFileHashes(project.root, project.workflowFiles);

  return stored && JSON.stringify(stored) === JSON.stringify(current) ? 'fresh' : 'stale';
}

/** Builds the doctor report explaining project detection and artifact freshness. */
export async function createDoctorReport(projectRoot: string | undefined): Promise<DoctorReport> {
  const project = await loadTemporalExplorerProject(projectRoot ? { root: projectRoot } : {});

  return {
    root: project.root,
    configurationSource: project.configuration ? 'temporal-explorer.config.ts' : 'defaults',
    tsconfig: toProjectPath(project.root, project.tsconfig),
    outputDirectory: toProjectPath(project.root, project.outputDirectory) || '.temporal-explorer',
    analysisArtifact: await getAnalysisFreshness(project),
    workflowFiles: project.workflowFiles.map((file) => ({
      path: toProjectPath(project.root, file),
      reason: project.configuration?.temporal?.workflowGlobs
        ? 'matched configured workflowGlobs'
        : 'matched default workflow globs',
    })),
    diagnosticOverrides: project.configuration?.diagnostics ?? {},
    connections: Object.entries(project.configuration?.connections ?? {}).map(
      ([name, profile]) => ({
        name,
        address: profile.address ?? '(missing address)',
        namespace: profile.namespace ?? 'default',
      }),
    ),
  };
}

/** Formats the doctor report for terminal output. */
export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    'Project',
    `  root: ${report.root}`,
    `  configuration: ${report.configurationSource}`,
    `  tsconfig: ${report.tsconfig}`,
    `  output: ${report.outputDirectory}`,
    '',
    `Analysis artifact: ${report.analysisArtifact}`,
    '',
    `Workflow files (${report.workflowFiles.length})`,
  ];

  for (const workflowFile of report.workflowFiles) {
    lines.push(`  ${workflowFile.path} (${workflowFile.reason})`);
  }

  const overrides = Object.entries(report.diagnosticOverrides);

  if (overrides.length > 0) {
    lines.push('', 'Diagnostic severity overrides');

    for (const [code, severity] of overrides) {
      lines.push(`  ${code}: ${severity}`);
    }
  }

  if (report.connections.length > 0) {
    lines.push('', 'Connection profiles');

    for (const connection of report.connections) {
      lines.push(`  ${connection.name}: ${connection.address} (${connection.namespace})`);
    }
  }

  return `${lines.join('\n')}\n`;
}
