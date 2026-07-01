import { z } from 'zod';

import { confidenceSchema, diagnosticSchema, sourceLocationSchema } from './common';

export const staticOverlayNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.union([z.literal('workflow'), z.literal('activity')]),
    name: z.string().min(1),
    observed: z.boolean(),
    source: sourceLocationSchema.optional(),
  })
  .strict();

export const mappingEvidenceSchema = z
  .object({
    kind: z.union([
      z.literal('activity-type'),
      z.literal('command-order'),
      z.literal('workflow-type'),
      z.literal('event-reference'),
      z.literal('source-location'),
      z.literal('unmapped'),
    ]),
    description: z.string().min(1),
    eventIds: z.array(z.number().int().positive()).optional(),
    staticNodeId: z.string().min(1).optional(),
  })
  .strict();

export const runtimeNodeMappingSchema = z
  .object({
    runtimeOperationId: z.string().min(1),
    staticNodeId: z.string().min(1).optional(),
    confidence: confidenceSchema,
    reason: z.string().min(1),
    evidence: z.array(mappingEvidenceSchema),
  })
  .strict();

export const executionOverlayDocumentSchema = z
  .object({
    schemaVersion: z.literal('temporal-overlay/v1'),
    artifactId: z.string().min(1),
    staticAnalysisId: z.string().min(1),
    runtimeTraceId: z.string().min(1),
    workflow: z.string().min(1),
    staticNodes: z.array(staticOverlayNodeSchema),
    mappings: z.array(runtimeNodeMappingSchema),
    branchOutcomes: z.array(z.unknown()),
    coverage: z
      .object({
        nodes: z
          .object({
            total: z.number().int().nonnegative(),
            observed: z.number().int().nonnegative(),
            skipped: z.number().int().nonnegative(),
            unmappedRuntimeOperations: z.number().int().nonnegative(),
          })
          .strict(),
        activities: z
          .object({
            staticTotal: z.number().int().nonnegative(),
            observed: z.number().int().nonnegative(),
            retried: z.number().int().nonnegative(),
            failed: z.number().int().nonnegative(),
          })
          .strict(),
        messages: z
          .object({
            staticSignals: z.number().int().nonnegative(),
            receivedSignals: z.array(z.string()),
            staticUpdates: z.number().int().nonnegative(),
            receivedUpdates: z.array(z.string()),
            staticQueries: z.number().int().nonnegative(),
          })
          .strict(),
        timers: z
          .object({
            staticTotal: z.number().int().nonnegative(),
            fired: z.number().int().nonnegative(),
            canceled: z.number().int().nonnegative(),
            pending: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();

export type MappingEvidence = z.infer<typeof mappingEvidenceSchema>;
export type StaticOverlayNode = z.infer<typeof staticOverlayNodeSchema>;
export type RuntimeNodeMapping = z.infer<typeof runtimeNodeMappingSchema>;
export type ExecutionOverlayDocument = z.infer<typeof executionOverlayDocumentSchema>;
