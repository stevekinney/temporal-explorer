import { Context } from '@temporalio/activity';

export type RetryInput = {
  orderId: string;
  failuresBeforeSuccess: number;
};

export type ChargeResult = {
  authorizationId: string;
  succeededOnAttempt: number;
};

export type RetryResult = {
  orderId: string;
  authorizationId: string;
  succeededOnAttempt: number;
};

export async function flakyCharge(
  orderId: string,
  failuresBeforeSuccess: number,
): Promise<ChargeResult> {
  const attempt = Context.current().info.attempt;

  if (attempt <= failuresBeforeSuccess) {
    throw new Error(`transient charge failure for ${orderId} on attempt ${attempt}`);
  }

  return {
    authorizationId: `authorization-${orderId}`,
    succeededOnAttempt: attempt,
  };
}
