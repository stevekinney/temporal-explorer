import { condition, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';

import type * as raceActivities from '../activities/race-activities';
import type { RaceInput, RaceResult } from '../activities/race-activities';

export const approveSignal = defineSignal<[string]>('approve');

const activities = proxyActivities<typeof raceActivities>({
  startToCloseTimeout: '1 minute',
});

export async function timerRaceWorkflow(input: RaceInput): Promise<RaceResult> {
  let approvedBy: string | undefined;

  setHandler(approveSignal, (approver) => {
    approvedBy = approver;
  });

  const approved = await condition(() => approvedBy !== undefined, '30 days');

  if (approved) {
    const notice = await activities.notifyApproved(input.requestId, approvedBy ?? 'unknown');

    return {
      requestId: input.requestId,
      outcome: 'approved',
      noticeId: notice.noticeId,
    };
  }

  const notice = await activities.notifyExpired(input.requestId);

  return {
    requestId: input.requestId,
    outcome: 'expired',
    noticeId: notice.noticeId,
  };
}
