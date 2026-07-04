import { proxyActivities } from '@temporalio/workflow';

import type * as reservationActivities from '../activities/reservation-activities';
import type {
  ConfirmationResult,
  InventoryReservation,
  ParallelResult,
  ReservationInput,
  ShippingReservation,
  ValidatedRequest,
} from '../activities/reservation-activities';

const { validateRequest, reserveInventory, reserveShipping, confirmReservation } = proxyActivities<
  typeof reservationActivities
>({
  startToCloseTimeout: '1 minute',
});

/**
 * Reserves inventory and shipping concurrently with a fixed `Promise.all`, so the
 * control-flow model emits a `parallel` region with one populated branch per array
 * element. This is the committed fixture that exercises fixed parallelism end to end.
 */
export async function parallelWorkflow(input: ReservationInput): Promise<ParallelResult> {
  const request: ValidatedRequest = await validateRequest(input);

  const [inventory, shipping]: [InventoryReservation, ShippingReservation] = await Promise.all([
    reserveInventory(request),
    reserveShipping(request),
  ]);

  const confirmation: ConfirmationResult = await confirmReservation(inventory, shipping);

  return { orderId: request.orderId, confirmationId: confirmation.confirmationId };
}
