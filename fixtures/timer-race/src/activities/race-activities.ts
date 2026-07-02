export type RaceInput = {
  requestId: string;
};

export type RaceNotice = {
  noticeId: string;
};

export type RaceResult = {
  requestId: string;
  outcome: 'approved' | 'expired';
  noticeId: string;
};

export async function notifyApproved(requestId: string, approvedBy: string): Promise<RaceNotice> {
  return {
    noticeId: `approved-${requestId}-${approvedBy}`,
  };
}

export async function notifyExpired(requestId: string): Promise<RaceNotice> {
  return {
    noticeId: `expired-${requestId}`,
  };
}
