import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type * as auditActivities from '../activities/audit-activities';
import type {
  OrderStatus,
  QueryFixtureInput,
  QueryFixtureResult,
} from '../activities/audit-activities';

export const statusQuery = defineQuery<OrderStatus>('status');
export const auditCountQuery = defineQuery<number, [string]>('auditCount');
export const illegalBumpQuery = defineQuery<number>('bump');
export const completeSignal = defineSignal('complete');

const activities = proxyActivities<typeof auditActivities>({
  startToCloseTimeout: '1 minute',
});

export async function queryWorkflow(input: QueryFixtureInput): Promise<QueryFixtureResult> {
  let status: OrderStatus = 'pending';
  let bumpCount = 0;
  const auditCategories: string[] = [];
  let done = false;

  setHandler(statusQuery, () => status);
  setHandler(
    auditCountQuery,
    (category) => auditCategories.filter((candidate) => candidate === category).length,
  );
  setHandler(illegalBumpQuery, () => {
    bumpCount += 1;
    return bumpCount;
  });
  setHandler(completeSignal, () => {
    done = true;
  });

  status = 'reviewing';
  const audit = await activities.recordAudit(input.requestId);
  auditCategories.push(audit.category);

  await condition(() => done);
  status = 'complete';

  return {
    requestId: input.requestId,
    status,
    auditCount: auditCategories.length,
  };
}
