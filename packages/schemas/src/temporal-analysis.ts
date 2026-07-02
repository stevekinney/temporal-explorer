import { z } from 'zod';

import {
  artifactMetadataSchema,
  confidenceSchema,
  diagnosticSchema,
  sourceLocationSchema,
  type Confidence,
  type SourceLocation,
} from './common';

export type TypeShape = {
  id: string;
  display: string;
  displayName?: string | undefined;
  fullyQualifiedName?: string | undefined;
  kind:
    | 'primitive'
    | 'object'
    | 'array'
    | 'tuple'
    | 'union'
    | 'intersection'
    | 'literal'
    | 'enum'
    | 'function'
    | 'promise'
    | 'external'
    | 'unknown';
  nullable?: boolean | undefined;
  optional?: boolean | undefined;
  properties?: Record<string, TypeShape> | undefined;
  items?: TypeShape | undefined;
  tupleItems?: TypeShape[] | undefined;
  union?: TypeShape[] | undefined;
  intersection?: TypeShape[] | undefined;
  source?: SourceLocation | undefined;
  module?: string | undefined;
  declaration?: SourceLocation | undefined;
  typeArguments?: TypeShape[] | undefined;
  references?: string[] | undefined;
  recursive?: boolean | undefined;
  confidence: Confidence;
};

const typeShapeSchema: z.ZodType<TypeShape> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      display: z.string().min(1),
      displayName: z.string().min(1).optional(),
      fullyQualifiedName: z.string().min(1).optional(),
      kind: z.union([
        z.literal('primitive'),
        z.literal('object'),
        z.literal('array'),
        z.literal('tuple'),
        z.literal('union'),
        z.literal('intersection'),
        z.literal('literal'),
        z.literal('enum'),
        z.literal('function'),
        z.literal('promise'),
        z.literal('external'),
        z.literal('unknown'),
      ]),
      nullable: z.boolean().optional(),
      optional: z.boolean().optional(),
      properties: z.record(z.string(), typeShapeSchema).optional(),
      items: typeShapeSchema.optional(),
      tupleItems: z.array(typeShapeSchema).optional(),
      union: z.array(typeShapeSchema).optional(),
      intersection: z.array(typeShapeSchema).optional(),
      source: sourceLocationSchema.optional(),
      module: z.string().min(1).optional(),
      declaration: sourceLocationSchema.optional(),
      typeArguments: z.array(typeShapeSchema).optional(),
      references: z.array(z.string().min(1)).optional(),
      recursive: z.boolean().optional(),
      confidence: confidenceSchema,
    })
    .strict(),
);

export const workflowSignatureSchema = z
  .object({
    args: z.array(typeShapeSchema),
    result: typeShapeSchema,
  })
  .strict();

export const temporalCommandSchema = z
  .object({
    id: z.string().min(1),
    kind: z.union([
      z.literal('activity'),
      z.literal('workflow-lifecycle'),
      z.literal('timer'),
      z.literal('condition'),
      z.literal('signal'),
      z.literal('query'),
      z.literal('update'),
      z.literal('child-workflow'),
      z.literal('external-workflow'),
      z.literal('continue-as-new'),
      z.literal('patch'),
      z.literal('cancellation-scope'),
      z.literal('dynamic'),
    ]),
    name: z.string().min(1),
    source: sourceLocationSchema,
    confidence: confidenceSchema,
    staticOrder: z.number().int().nonnegative(),
  })
  .strict();

export const signalDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    source: sourceLocationSchema,
    args: z.array(typeShapeSchema),
    handlerSource: sourceLocationSchema.optional(),
    confidence: confidenceSchema,
  })
  .strict();

export const queryDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    source: sourceLocationSchema,
    args: z.array(typeShapeSchema),
    result: typeShapeSchema.optional(),
    handlerSource: sourceLocationSchema.optional(),
    confidence: confidenceSchema,
  })
  .strict();

export const updateDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    source: sourceLocationSchema,
    args: z.array(typeShapeSchema),
    result: typeShapeSchema.optional(),
    handlerSource: sourceLocationSchema.optional(),
    validatorSource: sourceLocationSchema.optional(),
    confidence: confidenceSchema,
  })
  .strict();

export const workflowDependencySchema = z
  .object({
    kind: z.literal('type-import'),
    name: z.string().min(1),
    /** Project-relative module path without extension. */
    module: z.string().min(1),
  })
  .strict();

export const workflowDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    source: sourceLocationSchema,
    exported: z.boolean(),
    signature: workflowSignatureSchema,
    messageSurface: z
      .object({
        signals: z.array(signalDefinitionSchema),
        queries: z.array(queryDefinitionSchema),
        updates: z.array(updateDefinitionSchema),
      })
      .strict(),
    state: z
      .object({
        variables: z.array(z.unknown()),
      })
      .strict(),
    body: z
      .object({
        nodes: z.array(z.unknown()),
      })
      .strict(),
    temporalCommands: z.array(temporalCommandSchema),
    dependencies: z.array(workflowDependencySchema),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();

export const activityDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    source: sourceLocationSchema.optional(),
    implementationSource: sourceLocationSchema.optional(),
    confidence: confidenceSchema,
  })
  .strict();

export const temporalAnalysisDocumentSchema = z
  .object({
    schemaVersion: z.literal('temporal-analysis/v1'),
    artifactId: z.string().min(1),
    metadata: artifactMetadataSchema,
    project: z
      .object({
        root: z.string().min(1),
        tsconfig: z.string().min(1),
        packageManager: z
          .union([z.literal('bun'), z.literal('npm'), z.literal('pnpm'), z.literal('yarn')])
          .optional(),
      })
      .strict(),
    sdk: z
      .object({
        temporalTypeScriptVersion: z.string().min(1).optional(),
        detectedPackages: z.array(z.string().min(1)),
      })
      .strict(),
    workers: z.array(z.unknown()),
    workflows: z.array(workflowDefinitionSchema),
    activities: z.array(activityDefinitionSchema),
    clients: z.array(z.unknown()),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();

export type WorkflowSignature = z.infer<typeof workflowSignatureSchema>;
export type TemporalCommand = z.infer<typeof temporalCommandSchema>;
export type SignalDefinition = z.infer<typeof signalDefinitionSchema>;
export type QueryDefinition = z.infer<typeof queryDefinitionSchema>;
export type UpdateDefinition = z.infer<typeof updateDefinitionSchema>;
export type WorkflowDependency = z.infer<typeof workflowDependencySchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type ActivityDefinition = z.infer<typeof activityDefinitionSchema>;
export type TemporalAnalysisDocument = z.infer<typeof temporalAnalysisDocumentSchema>;
