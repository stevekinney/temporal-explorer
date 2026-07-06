export type RoutingInput = {
  requestId: string;
  tier: string;
};

export type FulfillmentResult = {
  path: string;
  handlerId: string;
};

export type RoutingReceipt = {
  receiptId: string;
};

export type RoutingResult = {
  requestId: string;
  tier: string;
  path: string;
};

export async function premiumFulfillment(requestId: string): Promise<FulfillmentResult> {
  return { path: 'premium', handlerId: `premium-${requestId}` };
}

export async function standardFulfillment(requestId: string): Promise<FulfillmentResult> {
  return { path: 'standard', handlerId: `standard-${requestId}` };
}

export async function basicFulfillment(requestId: string): Promise<FulfillmentResult> {
  return { path: 'basic', handlerId: `basic-${requestId}` };
}

export async function recordRouting(requestId: string, path: string): Promise<RoutingReceipt> {
  return { receiptId: `route-${requestId}-${path}` };
}
