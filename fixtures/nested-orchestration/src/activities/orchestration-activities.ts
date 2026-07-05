export type OrchestrationInput = {
  orderId: string;
  stages: string[];
};

export type PlanResult = {
  planId: string;
};

export type StageReceipt = {
  receiptId: string;
};

export type OrchestrationResult = {
  orderId: string;
  planId: string;
  completedStages: number;
};

export async function buildPlan(orderId: string): Promise<PlanResult> {
  return { planId: `plan-${orderId}` };
}

export async function reserveInventory(orderId: string, stage: string): Promise<StageReceipt> {
  return { receiptId: `inventory-${orderId}-${stage}` };
}

export async function reserveShipping(orderId: string, stage: string): Promise<StageReceipt> {
  return { receiptId: `shipping-${orderId}-${stage}` };
}

export async function confirmStage(orderId: string, stage: string): Promise<StageReceipt> {
  return { receiptId: `confirm-${orderId}-${stage}` };
}

/** Fails (not retried) so the branch's try/catch compensation path is exercised. */
export async function auditStage(orderId: string, stage: string): Promise<StageReceipt> {
  throw new Error(`audit failed for ${orderId} ${stage}`);
}

export async function compensateStage(orderId: string, stage: string): Promise<StageReceipt> {
  return { receiptId: `compensate-${orderId}-${stage}` };
}
