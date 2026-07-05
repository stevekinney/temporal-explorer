export type ReviewInput = {
  requestId: string;
  amount: number;
};

export type ApprovalRecord = {
  level: string;
  approverId: string;
};

export type ReviewReceipt = {
  receiptId: string;
};

export type ReviewResult = {
  requestId: string;
  level: string;
};

export async function seniorApproval(requestId: string): Promise<ApprovalRecord> {
  return { level: 'senior', approverId: `senior-${requestId}` };
}

export async function managerApproval(requestId: string): Promise<ApprovalRecord> {
  return { level: 'manager', approverId: `manager-${requestId}` };
}

export async function autoApprove(requestId: string): Promise<ApprovalRecord> {
  return { level: 'auto', approverId: `auto-${requestId}` };
}

export async function finalizeReview(requestId: string, level: string): Promise<ReviewReceipt> {
  return { receiptId: `review-${requestId}-${level}` };
}
