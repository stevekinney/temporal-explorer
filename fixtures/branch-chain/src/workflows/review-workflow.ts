import { proxyActivities } from '@temporalio/workflow';

import type * as approvalActivities from '../activities/approval-activities';
import type { ApprovalRecord, ReviewInput, ReviewResult } from '../activities/approval-activities';

const { seniorApproval, managerApproval, autoApprove, finalizeReview } = proxyActivities<
  typeof approvalActivities
>({
  startToCloseTimeout: '1 minute',
});

/**
 * Chooses an approval path with an `if / else if / else` chain, so the control-flow model
 * emits a single `branch` region of kind `if` with two clauses (the `if` and the `else if`)
 * plus a populated `otherwise` arm. The committed history exercises the middle `else if`.
 */
export async function reviewWorkflow(input: ReviewInput): Promise<ReviewResult> {
  let approval: ApprovalRecord;

  if (input.amount > 10_000) {
    approval = await seniorApproval(input.requestId);
  } else if (input.amount > 1_000) {
    approval = await managerApproval(input.requestId);
  } else {
    approval = await autoApprove(input.requestId);
  }

  await finalizeReview(input.requestId, approval.level);

  return { requestId: input.requestId, level: approval.level };
}
