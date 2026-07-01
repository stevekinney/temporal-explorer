import type { ZodIssue, ZodType } from 'zod';

import { temporalAnalysisDocumentSchema } from './temporal-analysis';
import { executionOverlayDocumentSchema } from './temporal-overlay';
import { runtimeTraceDocumentSchema } from './temporal-trace';

export const artifactSchemaVersions = {
  analysis: 'temporal-analysis/v1',
  trace: 'temporal-trace/v1',
  overlay: 'temporal-overlay/v1',
} as const;

export type ArtifactSchemaVersion =
  (typeof artifactSchemaVersions)[keyof typeof artifactSchemaVersions];

const artifactSchemaVersionValues = new Set<string>(Object.values(artifactSchemaVersions));

export function isTemporalExplorerArtifactSchemaVersion(
  value: string,
): value is ArtifactSchemaVersion {
  return artifactSchemaVersionValues.has(value);
}

export const artifactSchemasByVersion = {
  [artifactSchemaVersions.analysis]: temporalAnalysisDocumentSchema,
  [artifactSchemaVersions.trace]: runtimeTraceDocumentSchema,
  [artifactSchemaVersions.overlay]: executionOverlayDocumentSchema,
} satisfies Record<ArtifactSchemaVersion, ZodType>;

export type ArtifactValidationIssue = {
  path: string;
  message: string;
};

export type ArtifactValidationResult =
  | {
      success: true;
      schemaVersion: ArtifactSchemaVersion;
      value: unknown;
      issues: [];
    }
  | {
      success: false;
      schemaVersion?: ArtifactSchemaVersion;
      value?: never;
      issues: ArtifactValidationIssue[];
    };

function getSchemaVersion(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value)) {
    return undefined;
  }

  const candidate = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof candidate === 'string' ? candidate : undefined;
}

function formatZodIssue(issue: ZodIssue): ArtifactValidationIssue {
  return {
    path: issue.path.length > 0 ? issue.path.join('.') : '<root>',
    message: issue.message,
  };
}

/** Runtime-validates a Temporal Explorer JSON artifact by its `schemaVersion`. */
export function validateArtifact(value: unknown): ArtifactValidationResult {
  const schemaVersion = getSchemaVersion(value);

  if (!schemaVersion) {
    return {
      success: false,
      issues: [{ path: 'schemaVersion', message: 'Artifact is missing schemaVersion.' }],
    };
  }

  if (!isTemporalExplorerArtifactSchemaVersion(schemaVersion)) {
    return {
      success: false,
      issues: [
        {
          path: 'schemaVersion',
          message: `Unsupported artifact schema version: ${schemaVersion}.`,
        },
      ],
    };
  }

  const result = artifactSchemasByVersion[schemaVersion].safeParse(value);

  if (!result.success) {
    return {
      success: false,
      schemaVersion,
      issues: result.error.issues.map(formatZodIssue),
    };
  }

  return {
    success: true,
    schemaVersion,
    value: result.data,
    issues: [],
  };
}

export * from './common';
export * from './temporal-analysis';
export * from './temporal-overlay';
export * from './temporal-trace';
