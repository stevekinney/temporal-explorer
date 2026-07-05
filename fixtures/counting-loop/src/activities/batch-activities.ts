export type BatchInput = {
  batchId: string;
  total: number;
  skip: number;
  stopAfter: number;
};

export type ItemResult = {
  itemId: string;
};

export type BatchResult = {
  batchId: string;
  processed: number;
};

export async function processItem(batchId: string, index: number): Promise<ItemResult> {
  return { itemId: `${batchId}-item-${index}` };
}
