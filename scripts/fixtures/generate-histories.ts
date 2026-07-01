import { Buffer } from 'node:buffer';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { format } from 'prettier';

import * as activities from '../../fixtures/basic-order/src/activities/order-activities';

type TemporalHistoryEvent = {
  eventId?: string | number;
  eventType?: string | number;
  eventTime?: string;
  [key: string]: unknown;
};

type TemporalHistoryJson = {
  events?: TemporalHistoryEvent[];
  [key: string]: unknown;
};

type HistoryGenerationResult = {
  historyText: string;
  provenanceText: string;
};

const fixtureRoot = new URL('../../fixtures/basic-order/', import.meta.url);
const historyUrl = new URL('histories/success.json', fixtureRoot);
const provenanceUrl = new URL('histories/success.provenance.json', fixtureRoot);
const workflowUrl = new URL('src/workflows/basic-order-workflow.ts', fixtureRoot);
const workflowId = 'basic-order-success';
const normalizedRunId = 'success-run-id';
const normalizedIdentity = 'temporal-explorer-fixture-worker';
const taskQueue = 'basic-order-task-queue';
const baseEventTime = Date.UTC(2026, 0, 1, 0, 0, 0, 0);

async function createStableJson(value: unknown): Promise<string> {
  return await format(JSON.stringify(value), { parser: 'json' });
}

function createContentHash(text: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(text);
  return hasher.digest('hex');
}

function normalizeString(value: string, runId: string): string {
  if (value === runId) {
    return normalizedRunId;
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    return normalizedRunId;
  }

  return value;
}

type LongLike = { low: number; high: number; unsigned: boolean; toString(): string };

function isLongLike(value: object): value is LongLike {
  const constructorName = (value as { constructor?: { name?: unknown } }).constructor?.name;
  return constructorName === 'Long';
}

function toJsonCompatible(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }

  if (value && typeof value === 'object' && isLongLike(value)) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonCompatible);
  }

  if (value && typeof value === 'object') {
    return toJsonCompatibleObject(value);
  }

  return value;
}

function toJsonCompatibleObject(value: object): Record<string, unknown> {
  const jsonCompatible: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (childValue !== undefined && childValue !== null) {
      jsonCompatible[key] = toJsonCompatible(childValue);
    }
  }

  return jsonCompatible;
}

function normalizeByKey(
  value: unknown,
  key: string,
): { handled: true; value: unknown } | undefined {
  if (key === 'identity') {
    return { handled: true, value: normalizedIdentity };
  }

  if (key === 'historySizeBytes') {
    return { handled: true, value: '0' };
  }

  if ((key === 'coreUsedFlags' || key === 'langUsedFlags') && Array.isArray(value)) {
    return {
      handled: true,
      value: [...value].toSorted((left, right) => Number(left) - Number(right)),
    };
  }

  return undefined;
}

function normalizeValue(value: unknown, runId: string, key?: string): unknown {
  if (key !== undefined) {
    const byKey = normalizeByKey(value, key);
    if (byKey) {
      return byKey.value;
    }
  }

  if (typeof value === 'string') {
    return normalizeString(value, runId);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, runId));
  }

  if (value && typeof value === 'object') {
    const normalized: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      normalized[childKey] = normalizeValue(childValue, runId, childKey);
    }

    return normalized;
  }

  return value;
}

function isHistoryJson(value: unknown): value is TemporalHistoryJson {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeHistory(history: TemporalHistoryJson, runId: string): TemporalHistoryJson {
  const normalized = normalizeValue(history, runId);

  if (!isHistoryJson(normalized)) {
    throw new Error('normalizeValue did not return an object for a history input.');
  }

  const events = normalized.events ?? [];

  for (const event of events) {
    const eventId = Number(event.eventId ?? 0);
    event.eventTime = new Date(baseEventTime + eventId).toISOString();
  }

  return normalized;
}

function countEventTypes(history: TemporalHistoryJson): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const event of history.events ?? []) {
    const eventType = String(event.eventType ?? 'EVENT_TYPE_UNSPECIFIED');
    counts[eventType] = (counts[eventType] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

async function readRootPackageJson(): Promise<{ devDependencies: Record<string, string> }> {
  const parsed: unknown = await Bun.file(new URL('../../package.json', import.meta.url)).json();
  const devDependencies: Record<string, string> = {};

  if (typeof parsed === 'object' && parsed !== null && 'devDependencies' in parsed) {
    const raw = parsed.devDependencies;

    if (typeof raw === 'object' && raw !== null) {
      for (const [name, version] of Object.entries(raw)) {
        if (typeof version === 'string') {
          devDependencies[name] = version;
        }
      }
    }
  }

  return { devDependencies };
}

async function generateHistory(): Promise<HistoryGenerationResult> {
  const packageJson = await readRootPackageJson();
  const environment = await TestWorkflowEnvironment.createTimeSkipping();

  try {
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      ...(environment.namespace ? { namespace: environment.namespace } : {}),
      taskQueue,
      workflowsPath: workflowUrl.pathname,
      activities,
    });

    const { history, runId } = await worker.runUntil(async () => {
      const handle = await environment.client.workflow.start('basicOrderWorkflow', {
        workflowId,
        taskQueue,
        args: [
          {
            orderId: 'order-001',
            paymentToken: 'payment-token-redacted',
            shippingAddress: '123 Temporal Way',
          },
        ],
      });

      await handle.result();
      return {
        history: await handle.fetchHistory(),
        runId: handle.firstExecutionRunId,
      };
    });

    const rawHistory = toJsonCompatible(history);

    if (!isHistoryJson(rawHistory)) {
      throw new Error('Fetched history did not serialize to an object.');
    }

    const normalizedHistory = normalizeHistory(rawHistory, runId);
    const historyText = await createStableJson(normalizedHistory);
    const eventTypes = countEventTypes(normalizedHistory);

    const provenance = {
      schemaVersion: 'temporal-history-fixture/v1',
      fixture: 'basic-order',
      history: 'success',
      generatedBy: 'scripts/fixtures/generate-histories.ts',
      generationCommand: 'bun run fixtures:generate-histories',
      temporalSdkVersion: packageJson.devDependencies['@temporalio/client'] ?? 'unknown',
      testEnvironment: 'TestWorkflowEnvironment.createTimeSkipping',
      workflowType: 'basicOrderWorkflow',
      workflowId,
      runIdNormalization: {
        replacement: normalizedRunId,
      },
      identityNormalization: {
        replacement: normalizedIdentity,
      },
      timestampNormalization:
        'eventTime values are set to 2026-01-01T00:00:00.000Z plus eventId milliseconds.',
      eventCount: normalizedHistory.events?.length ?? 0,
      eventTypes,
      contentSha256: createContentHash(historyText),
    };

    return {
      historyText,
      provenanceText: await createStableJson(provenance),
    };
  } finally {
    await environment.teardown();
  }
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

const checkOnly = Bun.argv.includes('--check');
const result = await generateHistory();

if (checkOnly) {
  await assertUnchanged(historyUrl, result.historyText);
  await assertUnchanged(provenanceUrl, result.provenanceText);
  console.log('Fixture histories have no drift.');
} else {
  await Bun.write(historyUrl, result.historyText);
  await Bun.write(provenanceUrl, result.provenanceText);
  console.log(`Wrote ${historyUrl.pathname}`);
  console.log(`Wrote ${provenanceUrl.pathname}`);
}
