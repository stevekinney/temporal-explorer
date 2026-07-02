import type { WorkflowHandle } from '@temporalio/client';
import type { TestWorkflowEnvironment } from '@temporalio/testing';

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
  /** Workflow arguments. */
  args: unknown[];
  /** Optional interaction with the running Workflow before awaiting its result. */
  scenario?: (context: FixtureScenarioContext) => Promise<void>;
  /** Expected terminal state of the Workflow Execution. */
  expectedOutcome: 'completed' | 'failed' | 'canceled';
};

/** Every generated fixture history, in generation order. */
export const fixtureHistories: FixtureHistoryDefinition[] = [
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
