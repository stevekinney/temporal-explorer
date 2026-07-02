/**
 * This Workflow intentionally violates Temporal determinism rules so every
 * diagnostic has a fixture proving its code and source location. It is never
 * executed.
 */
import { readFileSync } from 'node:fs';

import { defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';

export const progressQuery = defineQuery<number>('progress');
export const duplicateSignal = defineSignal<[string]>('duplicated');
export const duplicateQuery = defineQuery<string>('duplicated');

type UnsafeActivities = {
  unresolvedActivity(input: string): Promise<string>;
};

const activities = proxyActivities<UnsafeActivities>({
  startToCloseTimeout: '1 minute',
});

export async function unsafeWorkflow(input: string): Promise<string> {
  let progress = 0;

  setHandler(progressQuery, () => {
    progress += 1;
    return progress;
  });
  setHandler(duplicateSignal, (note) => {
    void note;
  });

  const startedAt = Date.now();
  const jitter = Math.random();
  const startedDate = new Date();
  const configuration = readFileSync('configuration.json', 'utf8');
  const stored = await activities.unresolvedActivity(input);

  return [startedAt, jitter, startedDate.toISOString(), configuration, stored, progress].join(':');
}
