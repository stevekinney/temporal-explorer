import { condition, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';

import type * as approvalActivities from '../activities/approval-activities';
import type {
  ApprovalInput,
  ApprovalRecord,
  ApprovalResult,
} from '../activities/approval-activities';

export const approveSignal = defineSignal<[ApprovalRecord]>('approve');

const activities = proxyActivities<typeof approvalActivities>({
  startToCloseTimeout: '1 minute',
});

export async function approvalWorkflow(input: ApprovalInput): Promise<ApprovalResult> {
  let approval: ApprovalRecord | undefined;

  setHandler(approveSignal, (record) => {
    approval = record;
  });

  await condition(() => approval !== undefined);

  const approvedBy = approval?.approvedBy ?? 'unknown';
  const receipt = await activities.recordApproval({
    requestId: input.requestId,
    approvedBy,
  });

  return {
    requestId: input.requestId,
    approvedBy,
    receiptId: receipt.receiptId,
  };
}
