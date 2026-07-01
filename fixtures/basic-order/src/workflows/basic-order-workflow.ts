import { proxyActivities } from '@temporalio/workflow';

import type * as orderActivities from '../activities/order-activities';
import type {
  OrderInput,
  OrderResult,
  PaymentResult,
  ShipmentResult,
  ValidatedOrder,
} from '../activities/order-activities';

const activities = proxyActivities<typeof orderActivities>({
  startToCloseTimeout: '1 minute',
});

export async function basicOrderWorkflow(input: OrderInput): Promise<OrderResult> {
  const order: ValidatedOrder = await activities.validateOrder(input);
  const payment: PaymentResult = await activities.chargeCard(order);
  const shipment: ShipmentResult = await activities.shipOrder(order);

  return {
    orderId: order.orderId,
    authorizationId: payment.authorizationId,
    trackingNumber: shipment.trackingNumber,
  };
}
