import { proxyActivities } from '@temporalio/workflow';

import type * as broadcastActivities from '../activities/broadcast-activities';
import type { BroadcastInput, BroadcastResult } from '../activities/broadcast-activities';

const { prepareBroadcast, deliverToChannel, summarizeBroadcast } = proxyActivities<
  typeof broadcastActivities
>({
  startToCloseTimeout: '1 minute',
});

/**
 * Fans out one delivery Activity per channel with `Promise.all(channels.map(...))`, so
 * the control-flow model emits a `parallel` region whose argument is not an array literal:
 * a single dynamic `×N` template branch (rather than one branch per element) with its
 * command marked `fan-out`. This is the committed fixture that exercises dynamic
 * parallelism end to end.
 */
export async function broadcastWorkflow(input: BroadcastInput): Promise<BroadcastResult> {
  const prepared = await prepareBroadcast(input.requestId);

  const receipts = await Promise.all(
    input.channels.map((channel) => deliverToChannel(prepared.broadcastId, channel)),
  );

  const summary = await summarizeBroadcast(prepared.broadcastId, receipts.length);

  return {
    requestId: input.requestId,
    broadcastId: prepared.broadcastId,
    delivered: summary.delivered,
  };
}
