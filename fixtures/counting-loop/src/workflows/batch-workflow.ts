import { proxyActivities } from '@temporalio/workflow';

import type * as batchActivities from '../activities/batch-activities';
import type { BatchInput, BatchResult } from '../activities/batch-activities';

const { processItem } = proxyActivities<typeof batchActivities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Iterates a fixed count with a classic `for` loop that `continue`s past a skipped index
 * and `break`s after a threshold, so the control-flow model emits a `loop` region of kind
 * `for` whose body contains `continue` and `break` terminal markers. The committed history
 * (total 5, skip 1, stopAfter 3) processes indices 0, 2, and 3 deterministically.
 */
export async function batchWorkflow(input: BatchInput): Promise<BatchResult> {
  let processed = 0;

  for (let index = 0; index < input.total; index += 1) {
    if (index === input.skip) {
      continue;
    }

    await processItem(input.batchId, index);
    processed += 1;

    if (index === input.stopAfter) {
      break;
    }
  }

  return { batchId: input.batchId, processed };
}
