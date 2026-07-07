import { readdir } from 'node:fs/promises';

import { validateArtifact } from '@temporal-explorer/schemas';

type ValidationSummary = {
  histories: number;
  artifacts: number;
};

type HistoryEvent = {
  eventId?: unknown;
  eventType?: unknown;
  [key: string]: unknown;
};

const fixturesRoot = new URL('../../fixtures/', import.meta.url);

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

  assertActivityStartedReferences(events as HistoryEvent[], path);
}

function readEventId(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function readAttributes(event: HistoryEvent, key: string): Record<string, unknown> | undefined {
  const attributes = event[key];
  return attributes && typeof attributes === 'object' && !Array.isArray(attributes)
    ? (attributes as Record<string, unknown>)
    : undefined;
}

function assertActivityStartedReferences(events: HistoryEvent[], path: string): void {
  const eventsById = new Map<string, HistoryEvent>();

  for (const event of events) {
    const eventId = readEventId(event.eventId);

    if (eventId) {
      eventsById.set(eventId, event);
    }
  }

  for (const event of events) {
    if (Number(event.eventType) === 12) {
      assertActivityCompletedStartedReference(event, eventsById, path);
    }
  }
}

function assertActivityCompletedStartedReference(
  completedEvent: HistoryEvent,
  eventsById: Map<string, HistoryEvent>,
  path: string,
): void {
  const completedAttributes = readAttributes(
    completedEvent,
    'activityTaskCompletedEventAttributes',
  );
  const startedEventId = readEventId(completedAttributes?.['startedEventId']);

  if (!startedEventId) {
    return;
  }

  const startedEvent = eventsById.get(startedEventId);
  if (!startedEvent || Number(startedEvent.eventType) !== 11) {
    throw new Error(
      `${path} ActivityTaskCompleted event ${String(
        completedEvent.eventId,
      )} references startedEventId ${startedEventId}, but that event is not ActivityTaskStarted.`,
    );
  }

  assertMatchingActivitySchedule(completedEvent, completedAttributes, startedEvent, path);
}

function assertMatchingActivitySchedule(
  completedEvent: HistoryEvent,
  completedAttributes: Record<string, unknown> | undefined,
  startedEvent: HistoryEvent,
  path: string,
): void {
  const completedScheduledEventId = readEventId(completedAttributes?.['scheduledEventId']);
  const startedScheduledEventId = readEventId(
    readAttributes(startedEvent, 'activityTaskStartedEventAttributes')?.['scheduledEventId'],
  );

  if (completedScheduledEventId === startedScheduledEventId) {
    return;
  }

  throw new Error(
    `${path} ActivityTaskCompleted event ${String(
      completedEvent.eventId,
    )} references ActivityTaskStarted event ${String(
      startedEvent.eventId,
    )} for scheduledEventId ${String(
      startedScheduledEventId,
    )}, but the completion scheduledEventId is ${String(completedScheduledEventId)}.`,
  );
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

async function listFixtureDirectories(): Promise<string[]> {
  const entries = await readdir(fixturesRoot.pathname, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right));
}

async function validateHistoryFixtures(fixture: string, summary: ValidationSummary): Promise<void> {
  const historiesDirectory = new URL(`${fixture}/histories/`, fixturesRoot);
  const glob = new Bun.Glob('*.json');
  const historyNames: string[] = [];

  try {
    for await (const fileName of glob.scan({
      cwd: historiesDirectory.pathname,
      onlyFiles: true,
    })) {
      if (!fileName.endsWith('.provenance.json')) {
        historyNames.push(fileName.replace(/\.json$/u, ''));
      }
    }
  } catch {
    return;
  }

  for (const historyName of historyNames.toSorted((left, right) => left.localeCompare(right))) {
    const historyUrl = new URL(`${historyName}.json`, historiesDirectory);
    const provenanceUrl = new URL(`${historyName}.provenance.json`, historiesDirectory);

    assertHistoryShape(await readJsonFile(historyUrl), historyUrl.pathname);

    if (!(await Bun.file(provenanceUrl).exists())) {
      throw new Error(`${historyUrl.pathname} is missing its provenance file.`);
    }

    assertProvenanceShape(await readJsonFile(provenanceUrl), provenanceUrl.pathname);
    summary.histories += 1;
  }
}

async function validateArtifactFixtures(
  fixture: string,
  summary: ValidationSummary,
): Promise<void> {
  const artifactDirectory = new URL(`${fixture}/.temporal-explorer/`, fixturesRoot);
  const glob = new Bun.Glob('**/*.json');
  let relativePaths: string[] = [];

  try {
    relativePaths = await Array.fromAsync(
      glob.scan({ cwd: artifactDirectory.pathname, onlyFiles: true }),
    );
  } catch {
    return;
  }

  for (const relativePath of relativePaths.toSorted((left, right) => left.localeCompare(right))) {
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

for (const fixture of await listFixtureDirectories()) {
  await validateHistoryFixtures(fixture, summary);
  await validateArtifactFixtures(fixture, summary);
}

if (summary.histories === 0) {
  throw new Error('No fixture histories were found.');
}

console.log(`Validated ${summary.histories} history fixture(s).`);
console.log(`Validated ${summary.artifacts} Temporal Explorer artifact fixture(s).`);
