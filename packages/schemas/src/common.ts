import { z } from 'zod';

export const confidenceSchema = z.union([
  z.literal('exact'),
  z.literal('inferred'),
  z.literal('partial'),
  z.literal('ambiguous'),
  z.literal('dynamic'),
  z.literal('unknown'),
]);

export const sourcePositionSchema = z
  .object({
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .strict();

export const sourceLocationSchema = z
  .object({
    path: z.string().min(1),
    pathKind: z.union([z.literal('project-relative'), z.literal('absolute')]),
    start: sourcePositionSchema,
    end: sourcePositionSchema,
    symbolName: z.string().min(1).optional(),
  })
  .strict();

export const diagnosticSchema = z
  .object({
    code: z.string().min(1),
    category: z.union([
      z.literal('configuration'),
      z.literal('discovery'),
      z.literal('type-extraction'),
      z.literal('control-flow'),
      z.literal('determinism'),
      z.literal('history'),
      z.literal('mapping'),
      z.literal('rendering'),
      z.literal('privacy'),
      z.literal('compatibility'),
    ]),
    severity: z.union([z.literal('error'), z.literal('warning'), z.literal('info')]),
    message: z.string().min(1),
    source: sourceLocationSchema.optional(),
    relatedSources: z.array(sourceLocationSchema).optional(),
    confidence: confidenceSchema,
    documentationUrl: z.string().url().optional(),
  })
  .strict();

export const artifactMetadataSchema = z
  .object({
    temporalExplorerVersion: z.string().min(1),
    schemaVersion: z.string().min(1),
    generatedAt: z.string().datetime().optional(),
    inputs: z
      .object({
        projectRoot: z.string(),
        configHash: z.string(),
        tsconfigHash: z.string().optional(),
        packageMetadataHash: z.string().optional(),
        lockfileHash: z.string().optional(),
        sourceFileHashes: z.record(z.string(), z.string()),
        temporalSdkVersions: z.record(z.string(), z.string()),
      })
      .strict(),
  })
  .strict();

export type Confidence = z.infer<typeof confidenceSchema>;
export type SourceLocation = z.infer<typeof sourceLocationSchema>;
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export type ArtifactMetadata = z.infer<typeof artifactMetadataSchema>;
