export type DrainInput = {
  queueId: string;
  count: number;
};

export type DrainReceipt = {
  messageId: string;
};

export type DrainResult = {
  queueId: string;
  drained: number;
};

export async function drainOne(queueId: string, remaining: number): Promise<DrainReceipt> {
  return { messageId: `${queueId}-msg-${remaining}` };
}
