import { proxyActivities } from '@temporalio/workflow';

import type * as pollActivities from '../activities/poll-activities';
import type { PollInput, PollResult } from '../activities/poll-activities';

const { pollStatus } = proxyActivities<typeof pollActivities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Polls a job with a `do ... while` loop, so the control-flow model emits a `loop`
 * region of kind `do-while` — the body always runs at least once before the test. The
 * committed history (maxAttempts 3) polls three times deterministically.
 */
export async function pollWorkflow(input: PollInput): Promise<PollResult> {
  let attempt = 0;

  do {
    await pollStatus(input.jobId, attempt);
    attempt += 1;
  } while (attempt < input.maxAttempts);

  return { jobId: input.jobId, attempts: attempt };
}
