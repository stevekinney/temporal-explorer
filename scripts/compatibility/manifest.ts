/**
 * Enumerates every top-level sample in the fetched corpus and maintains
 * `fixtures/external/temporalio-samples.manifest.json`, a sample name ->
 * classification map. New samples are auto-classified conservatively; every
 * other classification is assigned by hand after inspecting real run results
 * (see `compatibility:test`).
 */
import { corpusRootUrl, listSampleDirectoryNames, manifestFileUrl, writeJsonFile } from './paths';
import { isClassification, isManifest, type Manifest, type ManifestEntry } from './types';

async function readManifest(): Promise<Manifest> {
  const file = Bun.file(manifestFileUrl);

  if (!(await file.exists())) {
    return {};
  }

  const value: unknown = await file.json();

  if (!isManifest(value)) {
    throw new Error(`Invalid manifest file at ${manifestFileUrl.pathname}.`);
  }

  return value;
}

async function hasTsconfig(sampleName: string): Promise<boolean> {
  return await Bun.file(new URL(`${sampleName}/tsconfig.json`, corpusRootUrl)).exists();
}

async function hasTypeScriptSources(sampleName: string): Promise<boolean> {
  const glob = new Bun.Glob('**/*.ts');
  const cwd = new URL(`${sampleName}/`, corpusRootUrl).pathname;
  const firstMatch = await glob.scan({ cwd, onlyFiles: true }).next();

  return !firstMatch.done;
}

/** Conservative default for a sample the manifest has never seen before. */
async function autoClassify(sampleName: string): Promise<ManifestEntry> {
  const [tsconfigPresent, tsSourcesPresent] = await Promise.all([
    hasTsconfig(sampleName),
    hasTypeScriptSources(sampleName),
  ]);

  if (!tsconfigPresent || !tsSourcesPresent) {
    return { classification: 'not-typescript' };
  }

  return { classification: 'covered' };
}

function isValidEntry(entry: ManifestEntry | undefined): entry is ManifestEntry {
  if (!entry || !isClassification(entry.classification)) {
    return false;
  }

  if (entry.classification === 'unsupported-with-reason') {
    return typeof entry.reason === 'string' && entry.reason.trim().length > 0;
  }

  return true;
}

/** Pure check mode: reports samples missing a valid classification; never writes. */
async function failOnUnclassified(): Promise<void> {
  const manifest = await readManifest();
  const sampleNames = await listSampleDirectoryNames();
  const unclassified = sampleNames.filter((name) => !isValidEntry(manifest[name]));

  if (unclassified.length > 0) {
    console.error(`${unclassified.length} sample(s) are missing a valid classification:`);
    for (const name of unclassified) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }

  console.log(`All ${sampleNames.length} sample(s) have a valid classification.`);
}

/** Default mode: adds conservative classifications for newly seen samples, then writes. */
async function classifyAndWrite(): Promise<void> {
  const manifest = await readManifest();
  const sampleNames = await listSampleDirectoryNames();
  let added = 0;

  for (const name of sampleNames) {
    if (manifest[name]) {
      continue;
    }

    manifest[name] = await autoClassify(name);
    added += 1;
  }

  const sorted: Manifest = {};
  for (const [name, entry] of Object.entries(manifest).toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    sorted[name] = entry;
  }

  await writeJsonFile(manifestFileUrl, sorted);
  console.log(`Classified ${added} new sample(s); manifest now has ${sampleNames.length} entries.`);
}

if (Bun.argv.includes('--fail-on-unclassified')) {
  await failOnUnclassified();
} else {
  await classifyAndWrite();
}
