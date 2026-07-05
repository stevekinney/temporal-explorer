import type { FixtureHistoryDefinition } from './manifest';

/**
 * Fixture histories exercising control-flow constructs — parallelism
 * (`Promise.all`/`race`/`allSettled`/`any`), branching (`switch`, if/else-if
 * chains), loops (`for`/`while`/`do-while`/`for-in`), `try`/`catch`/`finally`,
 * and nesting — for the explorer's flow-graph rendering. Split out of
 * `manifest.ts` so neither file exceeds the module line budget; assembled onto
 * `fixtureHistories` there, after the primitive fixtures, in generation order.
 */
export const controlFlowHistories: FixtureHistoryDefinition[] = [
  {
    fixture: 'dynamic-parallel',
    history: 'fanned-out',
    workflowType: 'broadcastWorkflow',
    taskQueue: 'dynamic-parallel-task-queue',
    workflowsPath: 'src/workflows/broadcast-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/dynamic-parallel/src/activities/broadcast-activities'),
    maxConcurrentActivityTaskExecutions: 1,
    args: [{ requestId: 'request-012', channels: ['email', 'sms', 'push'] }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'race',
    history: 'activity-wins',
    workflowType: 'raceWorkflow',
    taskQueue: 'race-task-queue',
    workflowsPath: 'src/workflows/race-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/race/src/activities/market-activities'),
    args: [{ requestId: 'request-013', symbol: 'ACME' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'all-settled',
    history: 'settled',
    workflowType: 'screeningWorkflow',
    taskQueue: 'all-settled-task-queue',
    workflowsPath: 'src/workflows/screening-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/all-settled/src/activities/screening-activities'),
    maxConcurrentActivityTaskExecutions: 1,
    args: [{ requestId: 'request-014', sku: 'sku-014' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'promise-any',
    history: 'fallback-wins',
    workflowType: 'regionWorkflow',
    taskQueue: 'promise-any-task-queue',
    workflowsPath: 'src/workflows/region-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/promise-any/src/activities/region-activities'),
    maxConcurrentActivityTaskExecutions: 1,
    args: [{ requestId: 'request-015', key: 'key-015' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'switch-routing',
    history: 'gold',
    workflowType: 'routingWorkflow',
    taskQueue: 'switch-routing-task-queue',
    workflowsPath: 'src/workflows/routing-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/switch-routing/src/activities/fulfillment-activities'),
    args: [{ requestId: 'request-016', tier: 'gold' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'branch-chain',
    history: 'manager',
    workflowType: 'reviewWorkflow',
    taskQueue: 'branch-chain-task-queue',
    workflowsPath: 'src/workflows/review-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/branch-chain/src/activities/approval-activities'),
    args: [{ requestId: 'request-017', amount: 5000 }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'counting-loop',
    history: 'iterated',
    workflowType: 'batchWorkflow',
    taskQueue: 'counting-loop-task-queue',
    workflowsPath: 'src/workflows/batch-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/counting-loop/src/activities/batch-activities'),
    args: [{ batchId: 'batch-018', total: 5, skip: 1, stopAfter: 3 }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'while-loop',
    history: 'drained',
    workflowType: 'drainWorkflow',
    taskQueue: 'while-loop-task-queue',
    workflowsPath: 'src/workflows/drain-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/while-loop/src/activities/drain-activities'),
    args: [{ queueId: 'queue-019', count: 3 }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'do-while-loop',
    history: 'polled',
    workflowType: 'pollWorkflow',
    taskQueue: 'do-while-loop-task-queue',
    workflowsPath: 'src/workflows/poll-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/do-while-loop/src/activities/poll-activities'),
    args: [{ jobId: 'job-020', maxAttempts: 3 }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'for-in-loop',
    history: 'applied',
    workflowType: 'flagWorkflow',
    taskQueue: 'for-in-loop-task-queue',
    workflowsPath: 'src/workflows/flag-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/for-in-loop/src/activities/flag-activities'),
    args: [{ configId: 'config-021', flags: { darkMode: true, betaSearch: true } }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'try-finally',
    history: 'charged',
    workflowType: 'chargeWorkflow',
    taskQueue: 'try-finally-task-queue',
    workflowsPath: 'src/workflows/charge-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/try-finally/src/activities/charge-activities'),
    args: [{ accountId: 'account-022' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'try-catch-finally',
    history: 'compensated',
    workflowType: 'bookingWorkflow',
    taskQueue: 'try-catch-finally-task-queue',
    workflowsPath: 'src/workflows/booking-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/try-catch-finally/src/activities/booking-activities'),
    args: [{ eventId: 'event-023' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'nested-orchestration',
    history: 'orchestrated',
    workflowType: 'orchestrationWorkflow',
    taskQueue: 'nested-orchestration-task-queue',
    workflowsPath: 'src/workflows/orchestration-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/nested-orchestration/src/activities/orchestration-activities'),
    maxConcurrentActivityTaskExecutions: 1,
    args: [{ orderId: 'order-024', stages: ['fulfillment', 'audit'] }],
    expectedOutcome: 'completed',
  },
];
