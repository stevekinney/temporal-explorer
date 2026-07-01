export type OrderInput = {
  orderId: string;
  paymentToken: string;
  shippingAddress: string;
};

export type ValidatedOrder = {
  orderId: string;
  totalCents: number;
};

export type PaymentResult = {
  authorizationId: string;
};

export type ShipmentResult = {
  trackingNumber: string;
};

export type OrderResult = {
  orderId: string;
  authorizationId: string;
  trackingNumber: string;
};

export async function validateOrder(input: OrderInput): Promise<ValidatedOrder> {
  return {
    orderId: input.orderId,
    totalCents: 4200,
  };
}

export async function chargeCard(order: ValidatedOrder): Promise<PaymentResult> {
  return {
    authorizationId: `authorization-${order.orderId}`,
  };
}

export async function shipOrder(order: ValidatedOrder): Promise<ShipmentResult> {
  return {
    trackingNumber: `tracking-${order.orderId}`,
  };
}
