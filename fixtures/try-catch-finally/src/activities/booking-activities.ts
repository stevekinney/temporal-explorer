export type BookingInput = {
  eventId: string;
};

export type SeatReceipt = {
  confirmationId: string;
};

export type FailureReceipt = {
  failureId: string;
};

export type HoldReceipt = {
  released: boolean;
};

export type BookingResult = {
  eventId: string;
  outcome: string;
};

/** Fails (not retried) so the catch clause is exercised deterministically. */
export async function reserveSeats(eventId: string): Promise<SeatReceipt> {
  throw new Error(`no seats available for ${eventId}`);
}

export async function recordFailure(eventId: string): Promise<FailureReceipt> {
  return { failureId: `failure-${eventId}` };
}

export async function releaseHold(eventId: string): Promise<HoldReceipt> {
  return { released: Boolean(eventId) };
}
