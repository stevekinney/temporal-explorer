import { proxyActivities } from '@temporalio/workflow';

import type * as bookingActivities from '../activities/booking-activities';
import type { BookingInput, BookingResult } from '../activities/booking-activities';

const { reserveSeats, recordFailure, releaseHold } = proxyActivities<typeof bookingActivities>({
  startToCloseTimeout: '1 minute',
  retry: { maximumAttempts: 1 },
});

/**
 * Books seats inside a full `try / catch / finally`, so the control-flow model emits a
 * `try` region with a body, a handler, and a finalizer. The reservation Activity fails
 * (not retried), the catch records the failure, and the finally always releases the hold,
 * so the committed history is deterministic and the Workflow completes.
 */
export async function bookingWorkflow(input: BookingInput): Promise<BookingResult> {
  let outcome = 'reserved';

  try {
    await reserveSeats(input.eventId);
  } catch {
    await recordFailure(input.eventId);
    outcome = 'failed';
  } finally {
    await releaseHold(input.eventId);
  }

  return { eventId: input.eventId, outcome };
}
