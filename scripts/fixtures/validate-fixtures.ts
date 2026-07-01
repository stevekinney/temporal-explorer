import { validateArtifact } from '@temporal-explorer/schemas';

type ValidationSummary = {
  histories: number;
  artifacts: number;
};

const fixtureRoot = new URL('../../fixtures/basic-order/', import.meta.url);

async function readJsonFile(url: URL): Promise<unknown> {
  return await Bun.file(url).json();
}

function assertHistoryShape(value: unknown, path: string): void {
  if (!value || typeof value !== 'object' || !('events' in value)) {
    throw new Error(`${path} is missing an events array.`);
  }

  const events = (value as { events?: unknown }).events;

  if (!Array.isArray(events) || events.length === 0) {
    throw new Error(`${path} must contain at least one Event History event.`);
  }
}

function assertProvenanceShape(value: unknown, path: string): void {
  if (!value || typeof value !== 'object') {
    throw new Error(`${path} is not a provenance object.`);
  }

  const provenance = value as {
    schemaVersion?: unknown;
    contentSha256?: unknown;
    eventCount?: unknown;
  };

  if (provenance.schemaVersion !== 'temporal-history-fixture/v1') {
    throw new Error(`${path} has an unsupported provenance schema version.`);
  }

  if (typeof provenance.contentSha256 !== 'string' || provenance.contentSha256.length === 0) {
    throw new Error(`${path} is missing contentSha256.`);
  }

  if (typeof provenance.eventCount !== 'number' || provenance.eventCount <= 0) {
    throw new Error(`${path} is missing a positive eventCount.`);
  }
}

async function validateHistoryFixtures(summary: ValidationSummary): Promise<void> {
  const historyUrl = new URL('histories/success.json', fixtureRoot);
  const provenanceUrl = new URL('histories/success.provenance.json', fixtureRoot);

  assertHistoryShape(await readJsonFile(historyUrl), historyUrl.pathname);
  assertProvenanceShape(await readJsonFile(provenanceUrl), provenanceUrl.pathname);
  summary.histories += 1;
}

async function validateArtifactFixtures(summary: ValidationSummary): Promise<void> {
  const artifactDirectory = new URL('.temporal-explorer/', fixtureRoot);
  const glob = new Bun.Glob('**/*.json');

  for await (const relativePath of glob.scan({
    cwd: artifactDirectory.pathname,
    onlyFiles: true,
  })) {
    const artifactUrl = new URL(relativePath, artifactDirectory);
    const artifact = await readJsonFile(artifactUrl);
    const result = validateArtifact(artifact);

    if (!result.success) {
      const issues = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
      throw new Error(`${artifactUrl.pathname} failed schema validation:\n${issues}`);
    }

    summary.artifacts += 1;
  }
}

const summary: ValidationSummary = {
  histories: 0,
  artifacts: 0,
};

await validateHistoryFixtures(summary);
await validateArtifactFixtures(summary);

console.log(`Validated ${summary.histories} history fixture(s).`);
console.log(`Validated ${summary.artifacts} Temporal Explorer artifact fixture(s).`);
