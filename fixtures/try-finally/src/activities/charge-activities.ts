export type ChargeInput = {
  accountId: string;
};

export type ChargeReceipt = {
  chargeId: string;
};

export type LockReceipt = {
  released: boolean;
};

export type TryFinallyResult = {
  accountId: string;
  chargeId: string;
};

export async function chargeAccount(accountId: string): Promise<ChargeReceipt> {
  return { chargeId: `charge-${accountId}` };
}

export async function releaseLock(accountId: string): Promise<LockReceipt> {
  return { released: Boolean(accountId) };
}
