import type { TemporalAnalysisDocument } from '@temporal-explorer/schemas';

import temporalExplorerPackageJson from '../../../package.json';

import type { FileSource } from './file-source';

export async function hashExistingTsconfig(
  source: FileSource,
  tsconfig: string | undefined,
): Promise<string> {
  return tsconfig && (await source.exists(tsconfig)) ? await source.hash(tsconfig) : '';
}

export function createAnalysisMetadata({
  projectName,
  configHash,
  sourceFileHashes,
  temporalTypeScriptVersion,
}: {
  projectName: string;
  configHash: string;
  sourceFileHashes: Record<string, string>;
  temporalTypeScriptVersion: string | undefined;
}): TemporalAnalysisDocument['metadata'] {
  return {
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
  };
}

export function createProjectMetadata({
  packageManager,
  projectName,
  tsconfigPath,
}: {
  packageManager: TemporalAnalysisDocument['project']['packageManager'];
  projectName: string;
  tsconfigPath: string;
}): TemporalAnalysisDocument['project'] {
  return {
    root: projectName,
    tsconfig: tsconfigPath,
    ...(packageManager ? { packageManager } : {}),
  };
}

export function createSdkMetadata(
  temporalTypeScriptVersion: string | undefined,
): TemporalAnalysisDocument['sdk'] {
  return {
    ...(temporalTypeScriptVersion ? { temporalTypeScriptVersion } : {}),
    detectedPackages: temporalTypeScriptVersion ? ['@temporalio/workflow'] : [],
  };
}
