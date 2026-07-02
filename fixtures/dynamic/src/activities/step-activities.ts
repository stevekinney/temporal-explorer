export type DynamicInput = {
  requestId: string;
  plan: string[];
};

export type DynamicResult = {
  requestId: string;
  stepResults: string[];
};

export async function prepareShipment(requestId: string): Promise<string> {
  return `prepared-${requestId}`;
}

export async function notifyWarehouse(requestId: string): Promise<string> {
  return `notified-${requestId}`;
}

export async function archiveRequest(requestId: string): Promise<string> {
  return `archived-${requestId}`;
}
