import { executeChild, startChild } from '@temporalio/workflow';

export type ParentInput = {
  orderId: string;
};

export type ChildInput = {
  orderId: string;
};

export type ChildSummary = {
  reservationId: string;
};

export type ChildNotice = {
  noticeId: string;
};

export type ParentResult = {
  orderId: string;
  reservationId: string;
  noticeId: string;
};

export async function reserveInventoryChild(input: ChildInput): Promise<ChildSummary> {
  return {
    reservationId: `reservation-${input.orderId}`,
  };
}

export async function releaseNotificationChild(input: ChildInput): Promise<ChildNotice> {
  return {
    noticeId: `notice-${input.orderId}`,
  };
}

export async function childWorkflowParent(input: ParentInput): Promise<ParentResult> {
  const summary = await executeChild(reserveInventoryChild, {
    args: [{ orderId: input.orderId }],
  });

  const handle = await startChild(releaseNotificationChild, {
    args: [{ orderId: input.orderId }],
  });
  const notice = await handle.result();

  return {
    orderId: input.orderId,
    reservationId: summary.reservationId,
    noticeId: notice.noticeId,
  };
}
