export type RaceInput = {
  requestId: string;
  symbol: string;
};

export type PriceQuote = {
  symbol: string;
  price: number;
};

export type QuoteReceipt = {
  receiptId: string;
};

export type RaceResult = {
  requestId: string;
  symbol: string;
  price: number;
  timedOut: boolean;
};

export async function fetchLivePrice(symbol: string): Promise<PriceQuote> {
  return { symbol, price: 100 };
}

export async function recordQuote(symbol: string, price: number): Promise<QuoteReceipt> {
  return { receiptId: `quote-${symbol}-${price}` };
}
