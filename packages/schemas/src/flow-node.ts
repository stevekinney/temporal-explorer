import { z } from 'zod';

import { sourceLocationSchema, type SourceLocation } from './common';

/**
 * A node in a Workflow body's structured control-flow tree. Leaves reference
 * `temporalCommands` by id; interior nodes capture branches, loops, parallelism,
 * and try/catch so renderers can draw the real shape instead of a flat line.
 * `body.nodes` is the top-level statement sequence. A `terminal` ends its
 * containing sequence for that path (later siblings are unreachable).
 */
export type FlowNode =
  | { type: 'command'; id: string; commandId: string; source?: SourceLocation | undefined }
  | {
      type: 'branch';
      id: string;
      branchKind: 'if' | 'switch' | 'ternary';
      source?: SourceLocation | undefined;
      testCommandId?: string | undefined;
      clauses: { label: string; body: FlowNode[]; fallsThrough?: boolean | undefined }[];
      otherwise?: FlowNode[] | undefined;
    }
  | {
      type: 'loop';
      id: string;
      loopKind: 'for' | 'for-of' | 'for-in' | 'while' | 'do-while';
      source?: SourceLocation | undefined;
      label?: string | undefined;
      initializer?: FlowNode[] | undefined;
      condition?: FlowNode[] | undefined;
      update?: FlowNode[] | undefined;
      body: FlowNode[];
    }
  | {
      type: 'parallel';
      id: string;
      parallelKind: 'all' | 'allSettled' | 'race' | 'any';
      source?: SourceLocation | undefined;
      cardinality: 'fixed' | 'dynamic';
      branches?: FlowNode[][] | undefined;
      templateBranch?: FlowNode[] | undefined;
    }
  | {
      type: 'try';
      id: string;
      source?: SourceLocation | undefined;
      body: FlowNode[];
      handler?: { label?: string | undefined; body: FlowNode[] } | undefined;
      finalizer?: FlowNode[] | undefined;
    }
  | {
      type: 'terminal';
      id: string;
      terminalKind: 'return' | 'throw' | 'continue-as-new' | 'break' | 'continue';
      source?: SourceLocation | undefined;
      label?: string | undefined;
      commandId?: string | undefined;
    };

export const flowNodeSchema: z.ZodType<FlowNode> = z.lazy(() =>
  z.union([
    z
      .object({
        type: z.literal('command'),
        id: z.string().min(1),
        commandId: z.string().min(1),
        source: sourceLocationSchema.optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('branch'),
        id: z.string().min(1),
        branchKind: z.union([z.literal('if'), z.literal('switch'), z.literal('ternary')]),
        source: sourceLocationSchema.optional(),
        testCommandId: z.string().min(1).optional(),
        clauses: z.array(
          z
            .object({
              label: z.string(),
              body: z.array(flowNodeSchema),
              fallsThrough: z.boolean().optional(),
            })
            .strict(),
        ),
        otherwise: z.array(flowNodeSchema).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('loop'),
        id: z.string().min(1),
        loopKind: z.union([
          z.literal('for'),
          z.literal('for-of'),
          z.literal('for-in'),
          z.literal('while'),
          z.literal('do-while'),
        ]),
        source: sourceLocationSchema.optional(),
        label: z.string().optional(),
        initializer: z.array(flowNodeSchema).optional(),
        condition: z.array(flowNodeSchema).optional(),
        update: z.array(flowNodeSchema).optional(),
        body: z.array(flowNodeSchema),
      })
      .strict(),
    z
      .object({
        type: z.literal('parallel'),
        id: z.string().min(1),
        parallelKind: z.union([
          z.literal('all'),
          z.literal('allSettled'),
          z.literal('race'),
          z.literal('any'),
        ]),
        source: sourceLocationSchema.optional(),
        cardinality: z.union([z.literal('fixed'), z.literal('dynamic')]),
        branches: z.array(z.array(flowNodeSchema)).optional(),
        templateBranch: z.array(flowNodeSchema).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('try'),
        id: z.string().min(1),
        source: sourceLocationSchema.optional(),
        body: z.array(flowNodeSchema),
        handler: z
          .object({ label: z.string().optional(), body: z.array(flowNodeSchema) })
          .strict()
          .optional(),
        finalizer: z.array(flowNodeSchema).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('terminal'),
        id: z.string().min(1),
        terminalKind: z.union([
          z.literal('return'),
          z.literal('throw'),
          z.literal('continue-as-new'),
          z.literal('break'),
          z.literal('continue'),
        ]),
        source: sourceLocationSchema.optional(),
        label: z.string().optional(),
        commandId: z.string().min(1).optional(),
      })
      .strict(),
  ]),
);
