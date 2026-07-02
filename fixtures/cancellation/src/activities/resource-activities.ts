export type CancellationInput = {
  resourceId: string;
};

export type ReservationReceipt = {
  reservationId: string;
};

export type ReleaseReceipt = {
  releaseId: string;
};

export type CancellationResult = {
  resourceId: string;
  outcome: 'completed' | 'released';
};

export async function reserveResources(resourceId: string): Promise<ReservationReceipt> {
  return {
    reservationId: `reservation-${resourceId}`,
  };
}

export async function useResources(resourceId: string): Promise<string> {
  return `used-${resourceId}`;
}

export async function releaseResources(resourceId: string): Promise<ReleaseReceipt> {
  return {
    releaseId: `release-${resourceId}`,
  };
}
