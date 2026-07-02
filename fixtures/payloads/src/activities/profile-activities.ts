export type PaymentProfile = {
  accountId: string;
  password: string;
  creditCard: string;
  note: string;
};

export type ProfileReceipt = {
  receiptId: string;
};

export async function storeProfile(profile: PaymentProfile): Promise<ProfileReceipt> {
  return {
    receiptId: `receipt-${profile.accountId}`,
  };
}
