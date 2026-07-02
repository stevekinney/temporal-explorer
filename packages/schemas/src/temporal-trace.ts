import { z } from 'zod';

import { artifactMetadataSchema, diagnosticSchema } from './common';

export const eventReferenceSchema = z
  .object({
    eventId: z.number().int().positive(),
    eventType: z.string().min(1),
  })
  .strict();

export const payloadReferenceSchema = z
  .object({
    id: z.string().min(1),
    eventId: z.number().int().positive(),
    kind: z.union([
      z.literal('input'),
      z.literal('result'),
      z.literal('failure'),
      z.literal('signal'),
      z.literal('update'),
    ]),
    decoded: z.boolean(),
    preview: z.unknown().optional(),
    redacted: z.boolean(),
  })
  .strict();

export const activityAttemptSchema = z
  .object({
    attempt: z.number().int().positive(),
    scheduledEventId: z.number().int().positive(),
    startedEventId: z.number().int().positive().optional(),
    closedEventId: z.number().int().positive().optional(),
    status: z.union([
      z.literal('completed'),
      z.literal('failed'),
      z.literal('timedOut'),
      z.literal('canceled'),
      z.literal('pending'),
    ]),
  })
  .strict();

export const workflowLifecycleOperationSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('workflow-lifecycle'),
    status: z.union([
      z.literal('started'),
      z.literal('completed'),
      z.literal('failed'),
      z.literal('canceled'),
    ]),
    eventReferences: z.array(eventReferenceSchema),
    payloadReferences: z.array(z.string().min(1)),
  })
  .strict();

export const activityExecutionOperationSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('activity'),
    activityType: z.string().min(1),
    activityId: z.string().min(1),
    status: z.union([
      z.literal('completed'),
      z.literal('failed'),
      z.literal('timedOut'),
      z.literal('canceled'),
      z.literal('pending'),
    ]),
    attempts: z.array(activityAttemptSchema),
    firstScheduledAt: z.string().datetime(),
    closedAt: z.string().datetime().optional(),
    durationMs: z.number().nonnegative().optional(),
    eventReferences: z.array(eventReferenceSchema),
    payloadReferences: z.array(z.string().min(1)),
  })
  .strict();

export const signalDeliveryOperationSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('signal'),
    signalName: z.string().min(1),
    receivedAt: z.string().datetime(),
    eventReferences: z.array(eventReferenceSchema),
    payloadReferences: z.array(z.string().min(1)),
  })
  .strict();

export const timerOperationSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('timer'),
    timerId: z.string().min(1),
    status: z.union([z.literal('fired'), z.literal('canceled'), z.literal('pending')]),
    startedAt: z.string().datetime(),
    closedAt: z.string().datetime().optional(),
    durationText: z.string().min(1).optional(),
    eventReferences: z.array(eventReferenceSchema),
  })
  .strict();

export const unmappedHistoryOperationSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('unmapped'),
    eventReferences: z.array(eventReferenceSchema),
    reason: z.string().min(1),
  })
  .strict();

export const runtimeOperationSchema = z.discriminatedUnion('kind', [
  workflowLifecycleOperationSchema,
  activityExecutionOperationSchema,
  signalDeliveryOperationSchema,
  timerOperationSchema,
  unmappedHistoryOperationSchema,
]);

export const runtimeTimelineEntrySchema = z
  .object({
    id: z.string().min(1),
    operationId: z.string().min(1),
    at: z.string().datetime(),
    label: z.string().min(1),
    eventIds: z.array(z.number().int().positive()),
  })
  .strict();

export const runtimeTraceDocumentSchema = z
  .object({
    schemaVersion: z.literal('temporal-trace/v1'),
    artifactId: z.string().min(1),
    metadata: artifactMetadataSchema,
    execution: z
      .object({
        workflowType: z.string().min(1),
        workflowId: z.string().min(1),
        runId: z.string().min(1),
        status: z.union([
          z.literal('running'),
          z.literal('completed'),
          z.literal('failed'),
          z.literal('canceled'),
          z.literal('terminated'),
          z.literal('timedOut'),
        ]),
        startedAt: z.string().datetime(),
        closedAt: z.string().datetime().optional(),
        durationMs: z.number().nonnegative().optional(),
      })
      .strict(),
    source: z
      .object({
        namespace: z.string().min(1).optional(),
        taskQueue: z.string().min(1).optional(),
        eventCount: z.number().int().nonnegative(),
        importedFrom: z.union([z.literal('file'), z.literal('api'), z.literal('cli')]),
      })
      .strict(),
    operations: z.array(runtimeOperationSchema),
    timeline: z.array(runtimeTimelineEntrySchema),
    payloads: z.array(payloadReferenceSchema),
    diagnostics: z.array(diagnosticSchema),
  })
  .strict();

export type EventReference = z.infer<typeof eventReferenceSchema>;
export type PayloadReference = z.infer<typeof payloadReferenceSchema>;
export type ActivityAttempt = z.infer<typeof activityAttemptSchema>;
export type RuntimeOperation = z.infer<typeof runtimeOperationSchema>;
export type RuntimeTimelineEntry = z.infer<typeof runtimeTimelineEntrySchema>;
export type RuntimeTraceDocument = z.infer<typeof runtimeTraceDocumentSchema>;
