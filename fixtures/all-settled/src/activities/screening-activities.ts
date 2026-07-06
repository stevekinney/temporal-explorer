export type ScreeningInput = {
  requestId: string;
  sku: string;
};

export type CheckResult = {
  check: string;
  passed: boolean;
};

export type ScreeningResult = {
  requestId: string;
  sku: string;
  passed: number;
};

export async function checkInventory(sku: string): Promise<CheckResult> {
  return { check: `inventory-${sku}`, passed: true };
}

export async function checkPricing(sku: string): Promise<CheckResult> {
  return { check: `pricing-${sku}`, passed: true };
}

export async function checkCompliance(sku: string): Promise<CheckResult> {
  return { check: `compliance-${sku}`, passed: true };
}
