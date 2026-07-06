import type { ZodIssue, ZodType } from 'zod';
import { z } from 'zod';

import { temporalAnalysisDocumentSchema } from './temporal-analysis';
import { executionOverlayDocumentSchema } from './temporal-overlay';
import { runtimeTraceDocumentSchema } from './temporal-trace';

export const artifactSchemaVersions = {
  analysis: 'temporal-analysis/v1',
  trace: 'temporal-trace/v1',
  overlay: 'temporal-overlay/v1',
} as const;

export const explorerBundleSchema = z
  .object({
    projectName: z.string().min(1),
    artifactDirectory: z.string().min(1),
    analysis: temporalAnalysisDocumentSchema,
    traces: z.array(runtimeTraceDocumentSchema),
    overlays: z.array(executionOverlayDocumentSchema),
  })
  .strict();

export type ExplorerArtifacts = z.infer<typeof explorerBundleSchema>;

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

/** Stable failure codes for artifact validation, usable by automation. */
export type ArtifactValidationFailureCode =
  'TES_MISSING_SCHEMA_VERSION' | 'TES_UNSUPPORTED_SCHEMA_VERSION' | 'TES_SCHEMA_VALIDATION_FAILED';

export type ArtifactValidationResult =
  | {
      success: true;
      schemaVersion: ArtifactSchemaVersion;
      value: unknown;
      issues: [];
    }
  | {
      success: false;
      code: ArtifactValidationFailureCode;
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
      code: 'TES_MISSING_SCHEMA_VERSION',
      issues: [{ path: 'schemaVersion', message: 'Artifact is missing schemaVersion.' }],
    };
  }

  if (!isTemporalExplorerArtifactSchemaVersion(schemaVersion)) {
    return {
      success: false,
      code: 'TES_UNSUPPORTED_SCHEMA_VERSION',
      issues: [
        {
          path: 'schemaVersion',
          message: `Unsupported artifact schema version: ${schemaVersion}. This build supports ${Object.values(artifactSchemaVersions).join(', ')}; newer artifacts require upgrading temporal-explorer.`,
        },
      ],
    };
  }

  const result = artifactSchemasByVersion[schemaVersion].safeParse(value);

  if (!result.success) {
    return {
      success: false,
      code: 'TES_SCHEMA_VALIDATION_FAILED',
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
export * from './flow-node';
export * from './temporal-analysis';
export * from './temporal-overlay';
export * from './temporal-trace';
