import { describe, expect, it } from 'bun:test';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import { validateArtifact } from '@temporal-explorer/schemas';

import { createLiveClient, fetchEventHistory, listWorkflowRuns } from './index';

// Minimal implementations matching the basic-order workflow's proxy names;
// the fixture package sits outside this package's rootDir.
const activities = {
  async validateOrder(input: { orderId: string }) {
    return { orderId: input.orderId, totalCents: 4200 };
  },
  async chargeCard(order: { orderId: string }) {
    return { authorizationId: `authorization-${order.orderId}` };
  },
  async shipOrder(order: { orderId: string }) {
    return { trackingNumber: `tracking-${order.orderId}` };
  },
};

const workflowsPath = new URL(
  '../../../fixtures/basic-order/src/workflows/basic-order-workflow.ts',
  import.meta.url,
).pathname;

// Live integration tests start a real Temporal dev server (heavy: server
// download, worker bundling). They run through `bun run test:live`, mirroring
// how other infrastructure-dependent gates are explicit commands, and stay
// out of the default parallel test run so they cannot starve other suites.
const liveTestsEnabled = Bun.env['TEMPORAL_EXPLORER_LIVE_TESTS'] === '1';

describe.skipIf(!liveTestsEnabled)('live Temporal connections', () => {
  it('lists runs and fetches histories from a running Temporal server', async () => {
    // The full local dev server is required: the time-skipping test server
    // does not implement the visibility APIs behind runs list.
    const environment = await TestWorkflowEnvironment.createLocal();

    try {
      const taskQueue = 'live-connection-task-queue';
      const worker = await Worker.create({
        connection: environment.nativeConnection,
        ...(environment.namespace ? { namespace: environment.namespace } : {}),
        taskQueue,
        workflowsPath,
        activities,
      });

      await worker.runUntil(async () => {
        const handle = await environment.client.workflow.start('basicOrderWorkflow', {
          workflowId: 'live-basic-order',
          taskQueue,
          args: [
            {
              orderId: 'order-live',
              paymentToken: 'live-token',
              shippingAddress: '456 Live Lane',
            },
          ],
        });
        await handle.result();
      });

      // Connect through the product's own live-connection path, exactly as a
      // configured connection profile would.
      const live = await createLiveClient({
        address: environment.address,
        namespace: environment.namespace ?? 'default',
      });

      try {
        // Visibility is eventually consistent; poll briefly (capped) for the
        // completed run to appear in list results.
        let runs = await listWorkflowRuns({
          client: live.client,
          workflowType: 'basicOrderWorkflow',
        });

        for (let attempt = 0; attempt < 5 && runs.length === 0; attempt += 1) {
          await Bun.sleep(500);
          runs = await listWorkflowRuns({
            client: live.client,
            workflowType: 'basicOrderWorkflow',
          });
        }

        expect(runs.map((run) => run.workflowId)).toContain('live-basic-order');
        expect(runs[0]?.status).toBe('COMPLETED');

        const { trace, runId } = await fetchEventHistory({
          client: live.client,
          workflowId: 'live-basic-order',
        });

        expect(runId.length).toBeGreaterThan(0);
        expect(validateArtifact(trace).success).toBe(true);
        expect(trace.execution.workflowType).toBe('basicOrderWorkflow');
        expect(trace.execution.status).toBe('completed');
        expect(trace.source.importedFrom).toBe('api');
        expect(
          trace.operations
            .filter((operation) => operation.kind === 'activity')
            .map((operation) => operation.kind === 'activity' && operation.activityType),
        ).toEqual(['validateOrder', 'chargeCard', 'shipOrder']);
        expect(trace.payloads.every((payload) => !payload.decoded && payload.redacted)).toBe(true);
      } finally {
        await live.close();
      }
    } finally {
      await environment.teardown();
    }
  }, 90_000);
});
