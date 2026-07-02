import { readdir } from 'node:fs/promises';

/** Repository root, resolved relative to this file rather than `process.cwd()`. */
export const repoRootUrl = new URL('../../', import.meta.url);
export const corpusRootUrl = new URL('test-corpora/temporalio-samples-typescript/', repoRootUrl);
export const corpusRelativePath = 'test-corpora/temporalio-samples-typescript';

export const lockFileUrl = new URL('fixtures/external/temporalio-samples.lock.json', repoRootUrl);
export const manifestFileUrl = new URL(
  'fixtures/external/temporalio-samples.manifest.json',
  repoRootUrl,
);
export const resultsFileUrl = new URL(
  'fixtures/external/temporalio-samples.results.json',
  repoRootUrl,
);

/** Reads the value following a CLI flag, e.g. `--commit abc123` -> `abc123`. */
export function getFlagValue(flag: string): string | undefined {
  const index = Bun.argv.indexOf(flag);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

/** Writes deterministic, human-diffable JSON (Prettier reformats it afterward). */
export async function writeJsonFile(url: URL, value: unknown): Promise<void> {
  await Bun.write(url, `${JSON.stringify(value, null, 2)}\n`);
}

async function hasPackageJson(sampleName: string): Promise<boolean> {
  return await Bun.file(new URL(`${sampleName}/package.json`, corpusRootUrl)).exists();
}

async function readCorpusDirectoryNames(): Promise<string[]> {
  try {
    const entries = await readdir(corpusRootUrl.pathname, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch {
    throw new Error(
      `Corpus not found at ${corpusRootUrl.pathname}. Run \`bun run compatibility:fetch-samples\` first.`,
    );
  }
}

/** Every top-level corpus directory that contains a `package.json`, sorted by name. */
export async function listSampleDirectoryNames(): Promise<string[]> {
  const candidates = await readCorpusDirectoryNames();
  const names: string[] = [];

  for (const name of candidates) {
    if (await hasPackageJson(name)) {
      names.push(name);
    }
  }

  return names.toSorted((left, right) => left.localeCompare(right));
}
