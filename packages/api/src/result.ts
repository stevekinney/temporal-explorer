import {
  artifactSchemaVersions,
  type ArtifactMetadata,
  type Diagnostic,
} from '@temporal-explorer/schemas';

import packageJson from '../../../package.json';

export type ArtifactReference = {
  path: string;
  schemaVersion: string;
};

export type TemporalExplorerResult<T> = {
  value: T;
  diagnostics: Diagnostic[];
  warnings: Diagnostic[];
  artifacts: ArtifactReference[];
  metadata: ArtifactMetadata;
};

export const temporalExplorerArtifactVersions = artifactSchemaVersions;

/** Returns the published package version, read from the root package.json. */
export function getTemporalExplorerVersion(): string {
  return packageJson.version;
}

/** Wraps a library value in the shared structured result contract. */
export function createTemporalExplorerResult<T>(
  value: T,
  options: {
    diagnostics?: Diagnostic[];
    warnings?: Diagnostic[];
    artifacts?: ArtifactReference[];
    metadata?: ArtifactMetadata;
  } = {},
): TemporalExplorerResult<T> {
  return {
    value,
    diagnostics: options.diagnostics ?? [],
    warnings: options.warnings ?? [],
    artifacts: options.artifacts ?? [],
    metadata: options.metadata ?? {
      temporalExplorerVersion: getTemporalExplorerVersion(),
      schemaVersion: temporalExplorerArtifactVersions.analysis,
      inputs: {
        projectRoot: '',
        configHash: '',
        sourceFileHashes: {},
        temporalSdkVersions: {},
      },
    },
  };
}
