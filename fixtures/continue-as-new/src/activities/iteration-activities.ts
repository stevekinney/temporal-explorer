export type IterationInput = {
  iteration: number;
  maxIterations: number;
};

export type IterationReceipt = {
  receiptId: string;
};

export async function recordIteration(iteration: number): Promise<IterationReceipt> {
  return {
    receiptId: `iteration-${iteration}`,
  };
}
