export type QueryFixtureInput = {
  requestId: string;
};

export type OrderStatus = 'pending' | 'reviewing' | 'complete';

export type AuditRecord = {
  category: string;
};

export type QueryFixtureResult = {
  requestId: string;
  status: OrderStatus;
  auditCount: number;
};

export async function recordAudit(requestId: string): Promise<AuditRecord> {
  return {
    category: `audit-${requestId}`,
  };
}
