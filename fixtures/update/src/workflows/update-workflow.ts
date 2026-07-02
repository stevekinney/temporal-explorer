import {
  ApplicationFailure,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type * as addressActivities from '../activities/address-activities';
import type {
  ShippingAddress,
  UpdateFixtureInput,
  UpdateFixtureResult,
} from '../activities/address-activities';

export const setAddressUpdate = defineUpdate<ShippingAddress, [ShippingAddress]>('setAddress');
export const explodeUpdate = defineUpdate<void, [string]>('explode');

const activities = proxyActivities<typeof addressActivities>({
  startToCloseTimeout: '1 minute',
});

export async function updateWorkflow(input: UpdateFixtureInput): Promise<UpdateFixtureResult> {
  let address: ShippingAddress = { street: input.initialStreet, city: 'Portland' };
  let updatesApplied = 0;
  let failedUpdates = 0;

  setHandler(
    setAddressUpdate,
    (next) => {
      address = next;
      updatesApplied += 1;
      return address;
    },
    {
      validator: (next) => {
        if (!next.street) {
          throw new Error('street is required');
        }
      },
    },
  );

  setHandler(explodeUpdate, (reason) => {
    failedUpdates += 1;
    throw ApplicationFailure.nonRetryable(`exploded: ${reason}`);
  });

  await condition(() => updatesApplied >= 1 && failedUpdates >= 1);

  const record = await activities.recordAddress(address);

  return {
    requestId: input.requestId,
    street: address.street,
    recordId: record.recordId,
  };
}
