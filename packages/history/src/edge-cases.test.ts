import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { RuntimeOperation } from '@temporal-explorer/schemas';

import { eventTypes } from './event-types';
import { importEventHistoryFile, parseEventHistory } from './index';
import { getDurationMs } from './references';

function isActivityOperation(
  operation: RuntimeOperation,
): operation is Extract<RuntimeOperation, { kind: 'activity' }> {
  return operation.kind === 'activity';
}

function eventTime(eventId: number): string {
  return `2026-01-01T00:00:00.${String(eventId).padStart(3, '0')}Z`;
}

function historyEvent(
  eventId: number,
  eventType: number,
  attributes: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    eventId,
    eventType,
    eventTime: eventTime(eventId),
    ...attributes,
  };
}

function encodedJsonPayload(value: unknown): Record<string, unknown> {
  return {
    metadata: {
      encoding: Buffer.from('json/plain').toString('base64'),
    },
    data: Buffer.from(JSON.stringify(value)).toString('base64'),
  };
}

function workflowStarted(
  attributes: Record<string, unknown> = {},
  eventId = 1,
): Record<string, unknown> {
  return historyEvent(eventId, eventTypes.workflowExecutionStarted, {
    workflowExecutionStartedEventAttributes: {
      workflowType: { name: 'coverageWorkflow' },
      originalExecutionRunId: 'coverage-run-id',
      taskQueue: { name: 'coverage-task-queue' },
      ...attributes,
    },
  });
}

function workflowClosed(eventId: number, eventType: number): Record<string, unknown> {
  return historyEvent(eventId, eventType, {
    workflowExecutionCompletedEventAttributes: {
      result: {
        payloads: [encodedJsonPayload({ completed: true })],
      },
    },
  });
}

function activityScheduled(
  eventId: number,
  activityType: string,
  payload = encodedJsonPayload({ activityType }),
): Record<string, unknown> {
  return historyEvent(eventId, eventTypes.activityTaskScheduled, {
    activityTaskScheduledEventAttributes: {
      activityId: `${activityType}-${eventId}`,
      activityType: { name: activityType },
      input: { payloads: [payload] },
    },
  });
}

function activityStarted(eventId: number, scheduledEventId: number): Record<string, unknown> {
  return historyEvent(eventId, eventTypes.activityTaskStarted, {
    activityTaskStartedEventAttributes: { scheduledEventId },
  });
}

function activityClosed(
  eventId: number,
  eventType: number,
  attributeName: string,
  scheduledEventId: number,
): Record<string, unknown> {
  return historyEvent(eventId, eventType, {
    [attributeName]: {
      scheduledEventId,
      failure: { payloads: [encodedJsonPayload({ failed: true })] },
      result: { payloads: [encodedJsonPayload({ done: true })] },
    },
  });
}

describe('event history parser edge cases', () => {
  it('rejects malformed Event History input with specific errors', () => {
    expect(() => parseEventHistory({ history: [] })).toThrow(
      'Event History must contain at least one event.',
    );
    expect(() => parseEventHistory({ history: [null] })).toThrow(
      'History event at index 0 is not an object.',
    );
    expect(() =>
      parseEventHistory({
        history: [{ eventType: 1, eventTime: '2026-01-01T00:00:00.001Z' }],
      }),
    ).toThrow('History event at index 0 is missing a positive eventId.');
    expect(() =>
      parseEventHistory({
        history: [{ eventId: 1, eventTime: '2026-01-01T00:00:00.001Z' }],
      }),
    ).toThrow('History event 1 is missing a positive eventType.');
    expect(() =>
      parseEventHistory({
        history: [{ eventId: 1, eventType: 1 }],
      }),
    ).toThrow('History event 1 is missing eventTime.');
    expect(() =>
      parseEventHistory({
        history: [
          historyEvent(2, eventTypes.workflowExecutionCompleted),
          historyEvent(3, eventTypes.workflowTaskScheduled),
        ],
      }),
    ).toThrow('Event History is missing WorkflowExecutionStarted.');
  });

  it('decodes allowed payload previews and preserves non-completed Activity attempts', () => {
    const trace = parseEventHistory({
      history: {
        events: [
          workflowStarted({
            input: { payloads: [encodedJsonPayload({ orderId: 'coverage-order' })] },
          }),
          activityScheduled(2, 'failActivity'),
          activityStarted(3, 2),
          activityClosed(4, eventTypes.activityTaskFailed, 'activityTaskFailedEventAttributes', 2),
          activityScheduled(5, 'pendingActivity'),
          activityStarted(6, 5),
          historyEvent(7, eventTypes.activityTaskCancelRequested, {
            activityTaskCancelRequestedEventAttributes: { scheduledEventId: 5 },
          }),
          activityScheduled(8, 'timeoutActivity'),
          activityClosed(
            9,
            eventTypes.activityTaskTimedOut,
            'activityTaskTimedOutEventAttributes',
            8,
          ),
          activityScheduled(10, 'cancelActivity'),
          activityClosed(
            11,
            eventTypes.activityTaskCanceled,
            'activityTaskCanceledEventAttributes',
            10,
          ),
          workflowClosed(12, eventTypes.workflowExecutionCompleted),
        ],
      },
      importedFrom: 'api',
      payloadPreview: {
        decodePayloads: true,
        redactPayloads: false,
        maxPreviewBytes: 1_000,
      },
    });
    const activities = trace.operations.filter(isActivityOperation);

    expect(trace.source.importedFrom).toBe('api');
    expect(trace.source.taskQueue).toBe('coverage-task-queue');
    expect(trace.payloads.some((payload) => payload.decoded && !payload.redacted)).toBe(true);
    expect(activities.map((activity) => activity.status)).toEqual([
      'failed',
      'pending',
      'timedOut',
      'canceled',
    ]);
    expect(
      activities.find((activity) => activity.activityType === 'pendingActivity')?.attempts,
    ).toEqual([
      {
        attempt: 1,
        scheduledEventId: 5,
        startedEventId: 6,
        status: 'pending',
      },
    ]);
  });

  it('reports running and non-completed Workflow statuses', () => {
    const runningTrace = parseEventHistory({
      history: [
        historyEvent(1, eventTypes.workflowExecutionStarted, {
          workflowExecutionStartedEventAttributes: {},
        }),
      ],
    });

    expect(runningTrace.execution.workflowType).toBe('unknownWorkflow');
    expect(runningTrace.execution.status).toBe('running');
    expect(getDurationMs('2026-01-01T00:00:01.000Z')).toBeUndefined();
    expect(getDurationMs('2026-01-01T00:00:01.000Z', '2026-01-01T00:00:00.000Z')).toBeUndefined();

    const closedCases = [
      [eventTypes.workflowExecutionFailed, 'failed'],
      [eventTypes.workflowExecutionCanceled, 'canceled'],
      [eventTypes.workflowExecutionTerminated, 'terminated'],
      [eventTypes.workflowExecutionTimedOut, 'timedOut'],
    ] as const;

    for (const [eventType, status] of closedCases) {
      const trace = parseEventHistory({
        history: [workflowStarted(), workflowClosed(2, eventType)],
      });

      expect(trace.execution.status).toBe(status);
    }
  });

  it('imports history files with optional provenance sidecars', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'temporal-explorer-history-'));
    const historyPath = join(directory, 'coverage.json');
    const history = {
      events: [workflowStarted()],
    };

    await Bun.write(historyPath, JSON.stringify(history));

    const traceWithoutProvenance = await importEventHistoryFile({
      file: historyPath,
      importedFrom: 'cli',
      payloadPreview: {
        decodePayloads: false,
      },
    });

    expect(traceWithoutProvenance.source.importedFrom).toBe('cli');
    expect(traceWithoutProvenance.execution.workflowType).toBe('coverageWorkflow');

    await Bun.write(join(directory, 'coverage.provenance.json'), JSON.stringify([]));

    const traceWithIgnoredProvenance = await importEventHistoryFile({
      file: historyPath,
    });

    expect(traceWithIgnoredProvenance.execution.workflowId).toBe(
      'coverageWorkflow-coverage-run-id',
    );
  });
});
