export type FlagInput = {
  configId: string;
  flags: Record<string, boolean>;
};

export type FlagReceipt = {
  appliedId: string;
};

export type FlagResult = {
  configId: string;
  applied: number;
};

export async function applyFlag(configId: string, flag: string): Promise<FlagReceipt> {
  return { appliedId: `${configId}-${flag}` };
}
