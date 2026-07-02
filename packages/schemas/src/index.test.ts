import { describe, expect, it } from 'bun:test';

import {
  artifactSchemaVersions,
  isTemporalExplorerArtifactSchemaVersion,
  validateArtifact,
} from './index';

describe('schema scaffold', () => {
  it('defines the first public artifact version names', () => {
    expect(artifactSchemaVersions.analysis).toBe('temporal-analysis/v1');
    expect(artifactSchemaVersions.trace).toBe('temporal-trace/v1');
    expect(artifactSchemaVersions.overlay).toBe('temporal-overlay/v1');
  });

  it('recognizes known Temporal Explorer artifact versions', () => {
    expect(isTemporalExplorerArtifactSchemaVersion('temporal-analysis/v1')).toBe(true);
    expect(isTemporalExplorerArtifactSchemaVersion('unknown/v1')).toBe(false);
  });

  it('validates a canonical Temporal analysis artifact', () => {
    const result = validateArtifact({
      schemaVersion: 'temporal-analysis/v1',
      artifactId: 'analysis-basic-order',
      metadata: {
        temporalExplorerVersion: '0.0.0-mvp',
        schemaVersion: 'temporal-analysis/v1',
        inputs: {
          projectRoot: 'fixtures/basic-order',
          configHash: 'sha256-empty',
          sourceFileHashes: {},
          temporalSdkVersions: {
            '@temporalio/workflow': '1.18.1',
          },
        },
      },
      project: {
        root: 'fixtures/basic-order',
        tsconfig: 'tsconfig.json',
        packageManager: 'bun',
      },
      sdk: {
        temporalTypeScriptVersion: '1.18.1',
        detectedPackages: ['@temporalio/workflow'],
      },
      workers: [],
      workflows: [],
      activities: [],
      clients: [],
      diagnostics: [],
    });

    expect(result.success).toBe(true);
  });

  it('rejects malformed artifacts with issue paths', () => {
    const result = validateArtifact({
      schemaVersion: 'temporal-analysis/v1',
      artifactId: 'broken',
    });

    expect(result.success).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'metadata')).toBe(true);
  });

  it('rejects artifacts without a supported schema version using stable codes', () => {
    expect(validateArtifact(null)).toEqual({
      success: false,
      code: 'TES_MISSING_SCHEMA_VERSION',
      issues: [{ path: 'schemaVersion', message: 'Artifact is missing schemaVersion.' }],
    });

    const newerArtifact = validateArtifact({ schemaVersion: 'temporal-analysis/v9' });

    expect(newerArtifact.success).toBe(false);
    expect(!newerArtifact.success && newerArtifact.code).toBe('TES_UNSUPPORTED_SCHEMA_VERSION');
    expect(newerArtifact.issues[0]?.message).toContain(
      'newer artifacts require upgrading temporal-explorer',
    );

    const invalidArtifact = validateArtifact({
      schemaVersion: 'temporal-analysis/v1',
      artifactId: 42,
    });

    expect(invalidArtifact.success).toBe(false);
    expect(!invalidArtifact.success && invalidArtifact.code).toBe('TES_SCHEMA_VALIDATION_FAILED');
  });
});
