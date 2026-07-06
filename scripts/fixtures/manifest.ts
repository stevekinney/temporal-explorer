import type { WorkflowHandle } from '@temporalio/client';
import type { DataConverter } from '@temporalio/common';
import type { TestWorkflowEnvironment } from '@temporalio/testing';

import { controlFlowHistories } from './control-flow-histories';

/** Context passed to a fixture scenario while its Workflow Execution is running. */
export type FixtureScenarioContext = {
  environment: TestWorkflowEnvironment;
  handle: WorkflowHandle;
};

/**
 * One generated Event History for a fixture project.
 *
 * Every history is produced by executing a real Workflow against a Temporal
 * test environment, never by hand-writing plausible JSON. The generator in
 * `generate-histories.ts` normalizes volatile fields so regeneration is
 * deterministic and drift-checkable.
 */
export type FixtureHistoryDefinition = {
  /** Fixture directory name under `fixtures/`. */
  fixture: string;
  /** History name; produces `histories/<history>.json` plus provenance. */
  history: string;
  /** Workflow type started by the generator. */
  workflowType: string;
  /** Task queue used by the fixture worker. */
  taskQueue: string;
  /** Workflow file path relative to the fixture directory. */
  workflowsPath: string;
  /** Loads Activity implementations registered on the fixture worker. */
  loadActivities?: () => Promise<object>;
  /**
   * Caps concurrent Activity Task execution on the fixture worker. Parallel
   * fixtures (`Promise.all`/`race`) set this to `1` so the branch activities
   * complete in a fixed, scheduled order and the generated history is
   * deterministic rather than racing on whichever activity finishes first.
   */
  maxConcurrentActivityTaskExecutions?: number;
  /** Workflow arguments. */
  args: unknown[];
  /** Optional interaction with the running Workflow before awaiting its result. */
  scenario?: (context: FixtureScenarioContext) => Promise<void>;
  /**
   * Loads a custom data converter (payload codecs) applied to both the worker
   * and a dedicated client. Fixtures using one must not rely on time skipping,
   * because the dedicated client lacks the time-skipping interceptor.
   */
  loadDataConverter?: () => Promise<DataConverter>;
  /** Expected terminal state of the Workflow Execution. */
  expectedOutcome: 'completed' | 'failed' | 'canceled';
  /**
   * Whether `fixtures:regenerate-artifacts` should produce committed
   * `.temporal-explorer` artifacts. Stays false until the construct slice that
   * owns the fixture is implemented, so committed artifacts are never
   * silently incomplete.
   */
  generateArtifacts?: boolean;
};

/**
 * Lets pending Workflow Tasks and command generation settle on the
 * time-skipping test server before a scenario interacts with the Workflow.
 * Ten seconds of skipped time is far below every fixture timer duration.
 */
async function settleWorkflowTasks(environment: TestWorkflowEnvironment): Promise<void> {
  await environment.sleep('10 seconds');
}

/** Fixture histories exercising Temporal primitives — signals, queries, updates, retries, child/external workflows, cancellation, continue-as-new, patching, payload codecs, and scale. */
const coreHistories: FixtureHistoryDefinition[] = [
  {
    fixture: 'basic-order',
    history: 'success',
    workflowType: 'basicOrderWorkflow',
    taskQueue: 'basic-order-task-queue',
    workflowsPath: 'src/workflows/basic-order-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/basic-order/src/activities/order-activities'),
    args: [
      {
        orderId: 'order-001',
        paymentToken: 'payment-token-redacted',
        shippingAddress: '123 Temporal Way',
      },
    ],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'approval',
    history: 'approved',
    workflowType: 'approvalWorkflow',
    taskQueue: 'approval-task-queue',
    workflowsPath: 'src/workflows/approval-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/approval/src/activities/approval-activities'),
    args: [{ requestId: 'request-001' }],
    scenario: async ({ environment, handle }) => {
      await settleWorkflowTasks(environment);
      await handle.signal('approve', { approvedBy: 'reviewer-1' });
    },
    expectedOutcome: 'completed',
  },
  {
    fixture: 'timer-race',
    history: 'signal-wins',
    workflowType: 'timerRaceWorkflow',
    taskQueue: 'timer-race-task-queue',
    workflowsPath: 'src/workflows/timer-race-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/timer-race/src/activities/race-activities'),
    args: [{ requestId: 'request-002' }],
    scenario: async ({ environment, handle }) => {
      await settleWorkflowTasks(environment);
      await handle.signal('approve', 'reviewer-2');
    },
    expectedOutcome: 'completed',
  },
  {
    fixture: 'timer-race',
    history: 'timeout',
    workflowType: 'timerRaceWorkflow',
    taskQueue: 'timer-race-task-queue',
    workflowsPath: 'src/workflows/timer-race-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/timer-race/src/activities/race-activities'),
    args: [{ requestId: 'request-003' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'query',
    history: 'completed',
    workflowType: 'queryWorkflow',
    taskQueue: 'query-task-queue',
    workflowsPath: 'src/workflows/query-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/query/src/activities/audit-activities'),
    args: [{ requestId: 'request-004' }],
    scenario: async ({ environment, handle }) => {
      await settleWorkflowTasks(environment);
      // Queries must not add events to history; the committed fixture proves it.
      await handle.query('status');
      await handle.signal('complete');
    },
    expectedOutcome: 'completed',
  },
  {
    fixture: 'update',
    history: 'updates',
    workflowType: 'updateWorkflow',
    taskQueue: 'update-task-queue',
    workflowsPath: 'src/workflows/update-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/update/src/activities/address-activities'),
    args: [{ requestId: 'request-005', initialStreet: '1 First Street' }],
    scenario: async ({ environment, handle }) => {
      await settleWorkflowTasks(environment);
      await handle.executeUpdate('setAddress', {
        args: [{ street: '2 Second Street', city: 'Portland' }],
      });

      try {
        // The validator rejects an empty street before acceptance, so this
        // update must not appear in Event History.
        await handle.executeUpdate('setAddress', { args: [{ street: '', city: 'Nowhere' }] });
        throw new Error('Expected the setAddress validator to reject an empty street.');
      } catch (error) {
        if (error instanceof Error && error.message.includes('Expected the setAddress')) {
          throw error;
        }
      }

      try {
        // The handler throws after acceptance, producing a failed outcome.
        await handle.executeUpdate('explode', { args: ['kaboom'] });
        throw new Error('Expected the explode update handler to fail.');
      } catch (error) {
        if (error instanceof Error && error.message.includes('Expected the explode')) {
          throw error;
        }
      }
    },
    expectedOutcome: 'completed',
  },
  {
    fixture: 'retry',
    history: 'retry-success',
    workflowType: 'retryWorkflow',
    taskQueue: 'retry-task-queue',
    workflowsPath: 'src/workflows/retry-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/retry/src/activities/charge-activities'),
    args: [{ orderId: 'order-retry', failuresBeforeSuccess: 2 }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'retry',
    history: 'failure',
    workflowType: 'retryWorkflow',
    taskQueue: 'retry-task-queue',
    workflowsPath: 'src/workflows/retry-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/retry/src/activities/charge-activities'),
    args: [{ orderId: 'order-doomed', failuresBeforeSuccess: 99 }],
    expectedOutcome: 'failed',
  },
  {
    fixture: 'child-workflow',
    history: 'success',
    workflowType: 'childWorkflowParent',
    taskQueue: 'child-workflow-task-queue',
    workflowsPath: 'src/workflows/child-workflow-parent.ts',
    args: [{ orderId: 'order-child' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'external',
    history: 'signaled',
    workflowType: 'externalWorkflowInteraction',
    taskQueue: 'external-task-queue',
    workflowsPath: 'src/workflows/external-interaction-workflow.ts',
    args: [{ requestId: 'request-006' }],
    scenario: async ({ environment, handle }) => {
      const target = await environment.client.workflow.start('externalSignalTarget', {
        workflowId: 'external-target-1',
        taskQueue: 'external-task-queue',
        args: [],
      });
      await settleWorkflowTasks(environment);
      await handle.signal('targetReady', 'external-target-1');
      await target.result();
    },
    expectedOutcome: 'completed',
  },
  {
    fixture: 'cancellation',
    history: 'canceled',
    workflowType: 'cancellationWorkflow',
    taskQueue: 'cancellation-task-queue',
    workflowsPath: 'src/workflows/cancellation-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/cancellation/src/activities/resource-activities'),
    args: [{ resourceId: 'resource-007' }],
    scenario: async ({ environment, handle }) => {
      await settleWorkflowTasks(environment);
      await handle.cancel();
    },
    expectedOutcome: 'canceled',
  },
  {
    fixture: 'continue-as-new',
    history: 'rollover',
    workflowType: 'continueAsNewWorkflow',
    taskQueue: 'continue-as-new-task-queue',
    workflowsPath: 'src/workflows/continue-as-new-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/continue-as-new/src/activities/iteration-activities'),
    args: [{ iteration: 0, maxIterations: 2 }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'patched',
    history: 'patched-run',
    workflowType: 'patchedWorkflow',
    taskQueue: 'patched-task-queue',
    workflowsPath: 'src/workflows/patched-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/patched/src/activities/charge-activities'),
    args: [{ orderId: 'order-patched' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'dynamic',
    history: 'planned',
    workflowType: 'dynamicWorkflow',
    taskQueue: 'dynamic-task-queue',
    workflowsPath: 'src/workflows/dynamic-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/dynamic/src/activities/step-activities'),
    args: [{ requestId: 'request-008', plan: ['prepareShipment', 'notifyWarehouse'] }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'payloads',
    history: 'encrypted',
    workflowType: 'payloadWorkflow',
    taskQueue: 'payloads-task-queue',
    workflowsPath: 'src/workflows/payload-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/payloads/src/activities/profile-activities'),
    loadDataConverter: async () => {
      const { payloadCodec } = await import('./payload-codec');
      return { payloadCodecs: [payloadCodec] };
    },
    args: [
      {
        accountId: 'account-009',
        password: 'hunter2',
        creditCard: '4111-1111-1111-1111',
        note: 'contains sensitive fields on purpose',
      },
    ],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'large',
    history: 'complete',
    workflowType: 'largeWorkflow',
    taskQueue: 'large-task-queue',
    workflowsPath: 'src/workflows/large-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/large/src/activities/large-activities'),
    args: [{ batchId: 'batch-010' }],
    expectedOutcome: 'completed',
  },
  {
    fixture: 'parallel',
    history: 'reserved',
    workflowType: 'parallelWorkflow',
    taskQueue: 'parallel-task-queue',
    workflowsPath: 'src/workflows/parallel-workflow.ts',
    loadActivities: async () =>
      await import('../../fixtures/parallel/src/activities/reservation-activities'),
    maxConcurrentActivityTaskExecutions: 1,
    args: [{ orderId: 'order-011', sku: 'sku-parallel', destination: '456 Concurrent Ave' }],
    expectedOutcome: 'completed',
  },
];

/** Every generated fixture history, in generation order: primitive fixtures first, then control-flow constructs. */
export const fixtureHistories: FixtureHistoryDefinition[] = [
  ...coreHistories,
  ...controlFlowHistories,
];

/** Returns the manifest entries selected by an optional `--fixture` filter. */
export function selectFixtureHistories(fixtureFilter?: string): FixtureHistoryDefinition[] {
  if (!fixtureFilter) {
    return fixtureHistories;
  }

  const selected = fixtureHistories.filter((definition) => definition.fixture === fixtureFilter);

  if (selected.length === 0) {
    throw new Error(`No fixture histories are registered for fixture "${fixtureFilter}".`);
  }

  return selected;
}
