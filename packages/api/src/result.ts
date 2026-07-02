import {
  artifactSchemaVersions,
  type ArtifactMetadata,
  type Diagnostic,
} from '@temporal-explorer/schemas';

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

/** Returns the package version used in generated artifacts during the MVP implementation. */
export function getTemporalExplorerVersion(): string {
  return '0.0.0-mvp';
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
