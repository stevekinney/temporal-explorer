export type ReservationInput = {
  orderId: string;
  sku: string;
  destination: string;
};

export type ValidatedRequest = {
  orderId: string;
  sku: string;
  destination: string;
};

export type InventoryReservation = {
  reservationId: string;
  sku: string;
};

export type ShippingReservation = {
  labelId: string;
  destination: string;
};

export type ConfirmationResult = {
  confirmationId: string;
};

export type ParallelResult = {
  orderId: string;
  confirmationId: string;
};

export async function validateRequest(input: ReservationInput): Promise<ValidatedRequest> {
  return { orderId: input.orderId, sku: input.sku, destination: input.destination };
}

export async function reserveInventory(request: ValidatedRequest): Promise<InventoryReservation> {
  return { reservationId: `inventory-${request.orderId}`, sku: request.sku };
}

export async function reserveShipping(request: ValidatedRequest): Promise<ShippingReservation> {
  return { labelId: `shipping-${request.orderId}`, destination: request.destination };
}

export async function confirmReservation(
  inventory: InventoryReservation,
  shipping: ShippingReservation,
): Promise<ConfirmationResult> {
  return { confirmationId: `confirmation-${inventory.reservationId}-${shipping.labelId}` };
}
