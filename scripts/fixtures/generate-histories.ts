import { Client } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import { selectFixtureHistories, type FixtureHistoryDefinition } from './manifest';
import {
  countEventTypes,
  createContentHash,
  createStableJson,
  isHistoryJson,
  normalizedIdentity,
  normalizeHistory,
  RunIdNormalizer,
  toJsonCompatible,
} from './normalize-history';

type HistoryGenerationResult = {
  historyUrl: URL;
  provenanceUrl: URL;
  historyText: string;
  provenanceText: string;
};

const fixturesRoot = new URL('../../fixtures/', import.meta.url);

async function readRootPackageJson(): Promise<{ dependencies: Record<string, string> }> {
  const parsed: unknown = await Bun.file(new URL('../../package.json', import.meta.url)).json();
  const dependencies: Record<string, string> = {};

  // Runtime and dev dependency maps are merged: the Temporal SDK packages
  // may legitimately live in either section of the root package.json.
  for (const section of ['dependencies', 'devDependencies']) {
    if (typeof parsed !== 'object' || parsed === null || !(section in parsed)) {
      continue;
    }

    const raw = (parsed as Record<string, unknown>)[section];

    if (typeof raw === 'object' && raw !== null) {
      for (const [name, version] of Object.entries(raw)) {
        if (typeof version === 'string') {
          dependencies[name] = version;
        }
      }
    }
  }

  return { dependencies };
}

async function executeFixtureWorkflow(
  environment: TestWorkflowEnvironment,
  definition: FixtureHistoryDefinition,
): Promise<{ history: unknown; runId: string }> {
  const fixtureRoot = new URL(`${definition.fixture}/`, fixturesRoot);
  const workflowUrl = new URL(definition.workflowsPath, fixtureRoot);
  const activities = definition.loadActivities ? await definition.loadActivities() : {};
  const workflowId = `${definition.fixture}-${definition.history}`;
  const dataConverter = definition.loadDataConverter
    ? await definition.loadDataConverter()
    : undefined;

  const worker = await Worker.create({
    connection: environment.nativeConnection,
    ...(environment.namespace ? { namespace: environment.namespace } : {}),
    taskQueue: definition.taskQueue,
    workflowsPath: workflowUrl.pathname,
    activities,
    ...(dataConverter ? { dataConverter } : {}),
    // Parallel fixtures serialize activity execution so the branch activities
    // report in a fixed order, keeping the generated history deterministic.
    ...(definition.maxConcurrentActivityTaskExecutions !== undefined
      ? { maxConcurrentActivityTaskExecutions: definition.maxConcurrentActivityTaskExecutions }
      : {}),
  });

  // Fixtures with a custom data converter need a dedicated client carrying the
  // same codecs; such fixtures must not depend on time skipping.
  const client = dataConverter
    ? new Client({
        connection: environment.connection,
        ...(environment.namespace ? { namespace: environment.namespace } : {}),
        dataConverter,
      })
    : environment.client;

  return await worker.runUntil(async () => {
    const handle = await client.workflow.start(definition.workflowType, {
      workflowId,
      taskQueue: definition.taskQueue,
      args: definition.args,
    });

    if (definition.scenario) {
      await definition.scenario({ environment, handle });
    }

    try {
      await handle.result();

      if (definition.expectedOutcome !== 'completed') {
        throw new Error(
          `${workflowId} completed but the manifest expected ${definition.expectedOutcome}.`,
        );
      }
    } catch (error) {
      if (definition.expectedOutcome === 'completed') {
        throw error;
      }
    }

    // Fetch the first execution run explicitly so continue-as-new fixtures
    // capture the run that ends with WorkflowExecutionContinuedAsNew instead
    // of following the chain to the final run.
    const firstRunHandle = client.workflow.getHandle(workflowId, handle.firstExecutionRunId);

    return {
      history: toJsonCompatible(await firstRunHandle.fetchHistory()),
      runId: handle.firstExecutionRunId ?? 'unknown-run-id',
    };
  });
}

async function generateHistory(
  environment: TestWorkflowEnvironment,
  definition: FixtureHistoryDefinition,
  temporalSdkVersion: string,
): Promise<HistoryGenerationResult> {
  const fixtureRoot = new URL(`${definition.fixture}/`, fixturesRoot);
  const historyUrl = new URL(`histories/${definition.history}.json`, fixtureRoot);
  const provenanceUrl = new URL(`histories/${definition.history}.provenance.json`, fixtureRoot);
  const workflowId = `${definition.fixture}-${definition.history}`;
  const { history, runId } = await executeFixtureWorkflow(environment, definition);

  if (!isHistoryJson(history)) {
    throw new Error(`Fetched history for ${workflowId} did not serialize to an object.`);
  }

  const runIds = new RunIdNormalizer(definition.history, runId);
  const normalizedHistory = normalizeHistory(history, runIds);
  const historyText = await createStableJson(normalizedHistory);
  const eventTypes = countEventTypes(normalizedHistory);

  const provenance = {
    schemaVersion: 'temporal-history-fixture/v1',
    fixture: definition.fixture,
    history: definition.history,
    generatedBy: 'scripts/fixtures/generate-histories.ts',
    generationCommand: 'bun run fixtures:generate-histories',
    temporalSdkVersion,
    testEnvironment: 'TestWorkflowEnvironment.createTimeSkipping',
    workflowType: definition.workflowType,
    workflowId,
    runIdNormalization: {
      replacement: `${definition.history}-run-id`,
    },
    identityNormalization: {
      replacement: normalizedIdentity,
    },
    timestampNormalization:
      'eventTime values are set to 2026-01-01T00:00:00.000Z plus eventId milliseconds.',
    binaryChecksumNormalization:
      'workflowTaskCompletedEventAttributes.binaryChecksum hash suffixes are replaced with fixture-binary-checksum.',
    eventCount: normalizedHistory.events?.length ?? 0,
    eventTypes,
    contentSha256: createContentHash(historyText),
  };

  return {
    historyUrl,
    provenanceUrl,
    historyText,
    provenanceText: await createStableJson(provenance),
  };
}

async function assertUnchanged(url: URL, expectedText: string): Promise<void> {
  const existingFile = Bun.file(url);

  if (!(await existingFile.exists())) {
    throw new Error(
      `${url.pathname} does not exist. Run bun run fixtures:generate-histories first.`,
    );
  }

  const actualText = await existingFile.text();

  if (actualText !== expectedText) {
    const comparableLength = Math.min(actualText.length, expectedText.length);
    let firstDifference = comparableLength;

    for (let index = 0; index < comparableLength; index += 1) {
      if (actualText[index] !== expectedText[index]) {
        firstDifference = index;
        break;
      }
    }
    const start = Math.max(0, firstDifference - 120);
    const end = firstDifference + 240;
    const actualContext = actualText.slice(start, end);
    const expectedContext = expectedText.slice(start, end);

    throw new Error(
      `${url.pathname} has fixture drift at character ${firstDifference}.\nActual:\n${actualContext}\nExpected:\n${expectedContext}\nRun bun run fixtures:generate-histories and review the diff.`,
    );
  }
}

function getFlagValue(flag: string): string | undefined {
  const index = Bun.argv.indexOf(flag);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

const checkOnly = Bun.argv.includes('--check');
const definitions = selectFixtureHistories(getFlagValue('--fixture'));
const packageJson = await readRootPackageJson();
const temporalSdkVersion = packageJson.dependencies['@temporalio/client'] ?? 'unknown';
const environment = await TestWorkflowEnvironment.createTimeSkipping();

try {
  for (const definition of definitions) {
    const result = await generateHistory(environment, definition, temporalSdkVersion);

    if (checkOnly) {
      await assertUnchanged(result.historyUrl, result.historyText);
      await assertUnchanged(result.provenanceUrl, result.provenanceText);
      console.log(`${definition.fixture}/${definition.history} has no drift.`);
    } else {
      await Bun.write(result.historyUrl, result.historyText);
      await Bun.write(result.provenanceUrl, result.provenanceText);
      console.log(`Wrote ${result.historyUrl.pathname}`);
      console.log(`Wrote ${result.provenanceUrl.pathname}`);
    }
  }
} finally {
  await environment.teardown();
}

if (checkOnly) {
  console.log('Fixture histories have no drift.');
}
