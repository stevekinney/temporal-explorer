export type RegionInput = {
  requestId: string;
  key: string;
};

export type RegionValue = {
  region: string;
  value: string;
};

export type AnyResult = {
  requestId: string;
  region: string;
  value: string;
};

/** Fails fast so `Promise.any` skips it in favor of the fulfilling fallback. */
export async function queryPrimaryRegion(key: string): Promise<RegionValue> {
  throw new Error(`primary region unavailable for ${key}`);
}

export async function queryFallbackRegion(key: string): Promise<RegionValue> {
  return { region: 'fallback', value: `value-${key}` };
}
