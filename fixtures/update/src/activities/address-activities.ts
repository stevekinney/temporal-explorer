export type UpdateFixtureInput = {
  requestId: string;
  initialStreet: string;
};

export type ShippingAddress = {
  street: string;
  city: string;
};

export type AddressRecord = {
  recordId: string;
};

export type UpdateFixtureResult = {
  requestId: string;
  street: string;
  recordId: string;
};

export async function recordAddress(address: ShippingAddress): Promise<AddressRecord> {
  return {
    recordId: `record-${address.street}-${address.city}`,
  };
}
