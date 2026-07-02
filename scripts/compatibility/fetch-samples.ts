/**
 * Fetches a SHA-pinned copy of temporalio/samples-typescript into
 * `test-corpora/` via `degit`, then records the resolved commit in
 * `fixtures/external/temporalio-samples.lock.json` for reproducible reruns.
 */
import { rm } from 'node:fs/promises';

import {
  corpusRelativePath,
  corpusRootUrl,
  getFlagValue,
  listSampleDirectoryNames,
  lockFileUrl,
  repoRootUrl,
  writeJsonFile,
} from './paths';
import { isLockFile, type LockFile } from './types';

const repository = 'temporalio/samples-typescript';
const commitPattern = /^[0-9a-f]{7,40}$/iu;

async function resolveHeadCommit(): Promise<string> {
  const output = await Bun.$`git ls-remote https://github.com/${repository} HEAD`.text();
  const [sha] = output.trim().split(/\s+/u);

  if (!sha || !commitPattern.test(sha)) {
    throw new Error(`Could not resolve a HEAD commit for ${repository} from: ${output}`);
  }

  return sha;
}

async function readExistingLock(): Promise<LockFile | undefined> {
  const file = Bun.file(lockFileUrl);

  if (!(await file.exists())) {
    return undefined;
  }

  const value: unknown = await file.json();

  if (!isLockFile(value)) {
    throw new Error(`Invalid lock file at ${lockFileUrl.pathname}.`);
  }

  return value;
}

async function resolveCommit(existingLock: LockFile | undefined): Promise<string> {
  const commitOverride = getFlagValue('--commit');

  if (commitOverride) {
    if (!commitPattern.test(commitOverride)) {
      throw new Error(`--commit must be a hex commit SHA, got: ${commitOverride}`);
    }
    return commitOverride;
  }

  if (Bun.argv.includes('--refresh') || !existingLock) {
    return await resolveHeadCommit();
  }

  return existingLock.commit;
}

const existingLock = await readExistingLock();
const commit = await resolveCommit(existingLock);

await rm(corpusRootUrl, { recursive: true, force: true });
await Bun.$`bunx degit ${repository}#${commit} ${corpusRelativePath} --force`.cwd(
  repoRootUrl.pathname,
);

const sampleNames = await listSampleDirectoryNames();
const sampleCount = sampleNames.length;

const lock: LockFile = {
  repository,
  commit,
  fetchedAt: new Date().toISOString(),
  sampleCount,
  compatibilitySuiteVersion: 1,
};

await writeJsonFile(lockFileUrl, lock);

console.log(`Fetched ${repository}#${commit} (${sampleCount} samples) into ${corpusRelativePath}.`);
console.log(`Updated ${lockFileUrl.pathname}.`);
