/** Every classification a sample in the external compatibility corpus can carry. */
export const classifications = [
  'covered',
  'expected-diagnostic',
  'unsupported-with-reason',
  'environment-dependent',
  'not-typescript',
] as const;

export type Classification = (typeof classifications)[number];

const classificationSet = new Set<string>(classifications);

/** Narrows an unknown value to a recognized `Classification`. */
export function isClassification(value: unknown): value is Classification {
  return typeof value === 'string' && classificationSet.has(value);
}

export type ManifestEntry = {
  classification: Classification;
  /** Required for `unsupported-with-reason`; optional context for others. */
  reason?: string;
};

/** Sample name -> classification, sorted by key when persisted. */
export type Manifest = Record<string, ManifestEntry>;

/** Narrows an unknown value read from disk to a `ManifestEntry`. */
export function isManifestEntry(value: unknown): value is ManifestEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { classification?: unknown; reason?: unknown };
  return (
    isClassification(candidate.classification) &&
    (candidate.reason === undefined || typeof candidate.reason === 'string')
  );
}

/** Narrows an unknown value read from disk to a `Manifest`. */
export function isManifest(value: unknown): value is Manifest {
  return typeof value === 'object' && value !== null && Object.values(value).every(isManifestEntry);
}

export type LockFile = {
  repository: string;
  commit: string;
  fetchedAt: string;
  sampleCount: number;
  compatibilitySuiteVersion: number;
};

/** Narrows an unknown value read from disk to a `LockFile`. */
export function isLockFile(value: unknown): value is LockFile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    repository?: unknown;
    commit?: unknown;
    fetchedAt?: unknown;
    sampleCount?: unknown;
    compatibilitySuiteVersion?: unknown;
  };
  return (
    typeof candidate.repository === 'string' &&
    typeof candidate.commit === 'string' &&
    typeof candidate.fetchedAt === 'string' &&
    typeof candidate.sampleCount === 'number' &&
    typeof candidate.compatibilitySuiteVersion === 'number'
  );
}

export type SampleOutcome = 'passed' | 'failed' | 'skipped';

export type SampleDiagnosticSummary = {
  code: string;
  severity: string;
};

export type SampleResult = {
  classification: Classification;
  outcome: SampleOutcome;
  workflows: string[];
  /** Files matched by the workflow discovery globs, independent of extraction. */
  workflowFileCount: number;
  diagnostics: SampleDiagnosticSummary[];
  durationMs: number;
  error?: string;
};

export type Subset = 'default' | 'full';

export type ResultsTotals = {
  samples: number;
  tested: number;
  passed: number;
  failed: number;
  skipped: number;
  byClassification: Record<Classification, number>;
  coveredZeroWorkflowSamples: number;
};

export type ResultsFile = {
  generatedAt: string;
  subset: Subset;
  corpus: {
    repository: string;
    commit: string;
    sampleCount: number;
  };
  totals: ResultsTotals;
  samples: Record<string, SampleResult>;
};
