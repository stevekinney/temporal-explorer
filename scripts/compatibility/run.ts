/**
 * Runs the compatibility harness over every 'covered'/'expected-diagnostic'
 * sample in the manifest and writes `fixtures/external/temporalio-samples.results.json`.
 * Exits non-zero if any 'covered' sample fails.
 */
import {
  getFlagValue,
  listSampleDirectoryNames,
  lockFileUrl,
  manifestFileUrl,
  resultsFileUrl,
  writeJsonFile,
} from './paths';
import { runSample } from './sample-runner';
import {
  isLockFile,
  isManifest,
  type Classification,
  type LockFile,
  type Manifest,
  type ManifestEntry,
  type ResultsFile,
  type ResultsTotals,
  type SampleResult,
  type Subset,
} from './types';

const DEFAULT_SUBSET_SIZE = 15;

function parseSubset(): Subset {
  const value = getFlagValue('--subset') ?? 'default';

  if (value !== 'default' && value !== 'full') {
    throw new Error(`--subset must be "default" or "full", got: ${value}`);
  }

  return value;
}

async function readManifestOrThrow(sampleNames: string[]): Promise<Manifest> {
  const file = Bun.file(manifestFileUrl);

  if (!(await file.exists())) {
    throw new Error(
      `Manifest not found at ${manifestFileUrl.pathname}. Run \`bun run compatibility:manifest\` first.`,
    );
  }

  const value: unknown = await file.json();

  if (!isManifest(value)) {
    throw new Error(`Invalid manifest file at ${manifestFileUrl.pathname}.`);
  }

  const manifest = value;
  const unclassified = sampleNames.filter((name) => !manifest[name]);

  if (unclassified.length > 0) {
    throw new Error(
      `${unclassified.length} sample(s) have no manifest entry (run \`bun run compatibility:manifest\`): ${unclassified.join(', ')}`,
    );
  }

  return manifest;
}

async function readLockOrThrow(): Promise<LockFile> {
  const file = Bun.file(lockFileUrl);

  if (!(await file.exists())) {
    throw new Error(
      `Lock file not found at ${lockFileUrl.pathname}. Run \`bun run compatibility:fetch-samples\` first.`,
    );
  }

  const value: unknown = await file.json();

  if (!isLockFile(value)) {
    throw new Error(`Invalid lock file at ${lockFileUrl.pathname}.`);
  }

  return value;
}

function isTestable(classification: Classification): boolean {
  return classification === 'covered' || classification === 'expected-diagnostic';
}

/** All samples reaching this point were verified present by `readManifestOrThrow`. */
function getEntry(manifest: Manifest, name: string): ManifestEntry {
  const entry = manifest[name];

  if (!entry) {
    throw new Error(`Missing manifest entry for "${name}".`);
  }

  return entry;
}

function selectSamples(manifest: Manifest, sampleNames: string[], subset: Subset): string[] {
  const sorted = sampleNames.toSorted((left, right) => left.localeCompare(right));
  const eligible = sorted.filter((name) => isTestable(getEntry(manifest, name).classification));

  if (subset === 'full') {
    return eligible;
  }

  return eligible
    .filter((name) => manifest[name]?.classification === 'covered')
    .slice(0, DEFAULT_SUBSET_SIZE);
}

function emptyByClassification(): Record<Classification, number> {
  return {
    covered: 0,
    'expected-diagnostic': 0,
    'unsupported-with-reason': 0,
    'environment-dependent': 0,
    'not-typescript': 0,
  };
}

function emptyTotals(sampleCount: number): ResultsTotals {
  const byClassification = emptyByClassification();

  return {
    samples: sampleCount,
    tested: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    byClassification,
    coveredZeroWorkflowSamples: 0,
  };
}

function skippedResult(classification: Classification): SampleResult {
  return {
    classification,
    outcome: 'skipped',
    workflows: [],
    workflowFileCount: 0,
    diagnostics: [],
    durationMs: 0,
  };
}

async function runSelected(
  sampleNames: string[],
  manifest: Manifest,
  selected: Set<string>,
  totals: ResultsTotals,
): Promise<Record<string, SampleResult>> {
  const samples: Record<string, SampleResult> = {};

  for (const name of sampleNames) {
    const classification = getEntry(manifest, name).classification;
    totals.byClassification[classification] += 1;

    if (!selected.has(name)) {
      samples[name] = skippedResult(classification);
      totals.skipped += 1;
      continue;
    }

    console.log(`Analyzing ${name}...`);
    const outcome = await runSample(name);
    samples[name] = { classification, ...outcome };
    totals.tested += 1;

    if (outcome.outcome === 'passed') {
      totals.passed += 1;
      if (classification === 'covered' && outcome.workflows.length === 0) {
        totals.coveredZeroWorkflowSamples += 1;
      }
    } else {
      totals.failed += 1;
      console.error(`  FAILED: ${outcome.error}`);
    }
  }

  return samples;
}

function reportAndExit(samples: Record<string, SampleResult>, totals: ResultsTotals): void {
  console.log(
    `\nTested ${totals.tested}/${totals.samples} sample(s): ${totals.passed} passed, ${totals.failed} failed, ${totals.skipped} skipped.`,
  );
  console.log(
    `${totals.coveredZeroWorkflowSamples} covered sample(s) discovered zero workflows (no files matched the discovery globs).`,
  );

  const entries = Object.entries(samples);
  const coveredFailures = entries.filter(
    ([, result]) => result.classification === 'covered' && result.outcome === 'failed',
  );
  const otherFailures = entries.filter(
    ([, result]) => result.classification !== 'covered' && result.outcome === 'failed',
  );

  if (otherFailures.length > 0) {
    console.warn(`\n${otherFailures.length} non-covered sample(s) failed (not gating exit code):`);
    for (const [name, result] of otherFailures) {
      console.warn(`  - ${name}: ${result.error}`);
    }
  }

  if (coveredFailures.length > 0) {
    console.error(`\n${coveredFailures.length} covered sample(s) failed:`);
    for (const [name, result] of coveredFailures) {
      console.error(`  - ${name}: ${result.error}`);
    }
    process.exit(1);
  }
}

const subset = parseSubset();
const sampleNames = await listSampleDirectoryNames();
const manifest = await readManifestOrThrow(sampleNames);
const lock = await readLockOrThrow();
const selected = new Set(selectSamples(manifest, sampleNames, subset));

const totals = emptyTotals(sampleNames.length);
const samples = await runSelected(sampleNames, manifest, selected, totals);

const results: ResultsFile = {
  generatedAt: new Date().toISOString(),
  subset,
  corpus: { repository: lock.repository, commit: lock.commit, sampleCount: lock.sampleCount },
  totals,
  samples,
};

await writeJsonFile(resultsFileUrl, results);
console.log(`Wrote ${resultsFileUrl.pathname}`);

reportAndExit(samples, totals);
