import { describe, expect, it } from 'bun:test';

import { eventTypes } from './event-types';
import { parseEventHistory } from './index';

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

function encodedPayload(encoding: string, value: string): Record<string, unknown> {
  return {
    metadata: {
      encoding: Buffer.from(encoding).toString('base64'),
    },
    data: Buffer.from(value).toString('base64'),
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

describe('payload preview redaction', () => {
  it('recursively redacts configured keys and string patterns in decoded previews', () => {
    const trace = parseEventHistory({
      history: [
        workflowStarted({
          input: {
            payloads: [
              encodedJsonPayload({
                accountId: 'account-1',
                password: 'hunter2',
                nested: { creditCard: '4111', note: 'call 555-0100 about ssn 123-45-6789' },
                tags: ['public', 'token abc'],
              }),
            ],
          },
        }),
      ],
      payloadPreview: {
        decodePayloads: true,
        redactKeys: ['password', 'creditCard'],
        redactPatterns: ['ssn', 'token'],
        maxPreviewBytes: 10_000,
      },
    });
    const payload = trace.payloads[0];

    expect(payload?.decoded).toBe(true);
    expect(payload?.redacted).toBe(true);
    expect(payload?.preview).toEqual({
      accountId: 'account-1',
      password: '[REDACTED]',
      nested: { creditCard: '[REDACTED]', note: '[REDACTED]' },
      tags: ['public', '[REDACTED]'],
    });
  });

  it('marks decoded previews unredacted when no rule matches', () => {
    const trace = parseEventHistory({
      history: [
        workflowStarted({
          input: { payloads: [encodedJsonPayload({ orderId: 'order-1' })] },
        }),
      ],
      payloadPreview: {
        decodePayloads: true,
        redactKeys: ['password'],
        maxPreviewBytes: 10_000,
      },
    });

    expect(trace.payloads[0]?.decoded).toBe(true);
    expect(trace.payloads[0]?.redacted).toBe(false);
    expect(trace.payloads[0]?.preview).toEqual({ orderId: 'order-1' });
  });

  it('redacts previews that exceed the configured byte limit', () => {
    const trace = parseEventHistory({
      history: [workflowStarted({ input: { payloads: [encodedJsonPayload({ tooLarge: true })] } })],
      payloadPreview: {
        decodePayloads: true,
        redactPayloads: false,
        maxPreviewBytes: 1,
      },
    });

    expect(trace.payloads).toEqual([
      {
        id: 'payload:event-1:input:0',
        eventId: 1,
        kind: 'input',
        decoded: false,
        redacted: true,
      },
    ]);
  });

  it('redacts payloads without supported JSON payload data', () => {
    const trace = parseEventHistory({
      history: [
        workflowStarted({
          input: {
            payloads: [encodedPayload('binary/plain', 'not-json')],
          },
        }),
      ],
      payloadPreview: {
        decodePayloads: true,
        redactPayloads: false,
        maxPreviewBytes: 1_000,
      },
    });

    expect(trace.payloads[0]?.decoded).toBe(false);
    expect(trace.payloads[0]?.redacted).toBe(true);
  });
});
