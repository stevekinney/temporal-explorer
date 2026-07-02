export type ApprovalInput = {
  requestId: string;
};

export type ApprovalRecord = {
  approvedBy: string;
};

export type ApprovalReceipt = {
  receiptId: string;
};

export type ApprovalResult = {
  requestId: string;
  approvedBy: string;
  receiptId: string;
};

export async function recordApproval(input: {
  requestId: string;
  approvedBy: string;
}): Promise<ApprovalReceipt> {
  return {
    receiptId: `receipt-${input.requestId}-${input.approvedBy}`,
  };
}
