import { proxyActivities, sleep } from '@temporalio/workflow';

import type * as marketActivities from '../activities/market-activities';
import type { PriceQuote, RaceInput, RaceResult } from '../activities/market-activities';

const { fetchLivePrice, recordQuote } = proxyActivities<typeof marketActivities>({
  startToCloseTimeout: '1 minute',
});

const PRICE_DEADLINE = '10 minutes';

/**
 * Races a live-price Activity against a deadline timer with `Promise.race`, so the
 * control-flow model emits a fixed `parallel` region of kind `race` with two branches:
 * one Activity, one timer. The Activity always wins in the committed history and the
 * `if (priced)` branch that follows records the quote; the timer never fires because
 * the Workflow returns first, keeping the generated history deterministic.
 */
export async function raceWorkflow(input: RaceInput): Promise<RaceResult> {
  const priced: PriceQuote | void = await Promise.race([
    fetchLivePrice(input.symbol),
    sleep(PRICE_DEADLINE),
  ]);

  if (priced) {
    await recordQuote(priced.symbol, priced.price);

    return {
      requestId: input.requestId,
      symbol: priced.symbol,
      price: priced.price,
      timedOut: false,
    };
  }

  return { requestId: input.requestId, symbol: input.symbol, price: 0, timedOut: true };
}
