import { proxyActivities } from '@temporalio/workflow';

import type * as profileActivities from '../activities/profile-activities';
import type { PaymentProfile, ProfileReceipt } from '../activities/profile-activities';

const activities = proxyActivities<typeof profileActivities>({
  startToCloseTimeout: '1 minute',
});

export async function payloadWorkflow(profile: PaymentProfile): Promise<ProfileReceipt> {
  return await activities.storeProfile(profile);
}
