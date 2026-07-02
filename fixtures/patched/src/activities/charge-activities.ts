export type PatchedInput = {
  orderId: string;
};

export type ChargeReceipt = {
  chargeId: string;
  processor: 'legacy' | 'modern';
};

export type PatchedResult = {
  orderId: string;
  chargeId: string;
  processor: 'legacy' | 'modern';
};

export async function oldCharge(orderId: string): Promise<ChargeReceipt> {
  return {
    chargeId: `legacy-${orderId}`,
    processor: 'legacy',
  };
}

export async function newCharge(orderId: string): Promise<ChargeReceipt> {
  return {
    chargeId: `modern-${orderId}`,
    processor: 'modern',
  };
}
