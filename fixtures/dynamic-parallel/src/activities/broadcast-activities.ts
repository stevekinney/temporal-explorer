export type BroadcastInput = {
  requestId: string;
  channels: string[];
};

export type PreparedBroadcast = {
  broadcastId: string;
};

export type ChannelReceipt = {
  channel: string;
  receiptId: string;
};

export type BroadcastSummary = {
  summaryId: string;
  delivered: number;
};

export type BroadcastResult = {
  requestId: string;
  broadcastId: string;
  delivered: number;
};

export async function prepareBroadcast(requestId: string): Promise<PreparedBroadcast> {
  return { broadcastId: `broadcast-${requestId}` };
}

export async function deliverToChannel(
  broadcastId: string,
  channel: string,
): Promise<ChannelReceipt> {
  return { channel, receiptId: `${broadcastId}-${channel}` };
}

export async function summarizeBroadcast(
  broadcastId: string,
  delivered: number,
): Promise<BroadcastSummary> {
  return { summaryId: `summary-${broadcastId}`, delivered };
}
