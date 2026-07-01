import { describe, expect, it } from 'bun:test';

import { validateArtifact, type RuntimeOperation } from '@temporal-explorer/schemas';

import { parseEventHistory } from './index';

const historyFile = new URL(
  '../../../fixtures/basic-order/histories/success.json',
  import.meta.url,
);

function isActivityOperation(
  operation: RuntimeOperation,
): operation is Extract<RuntimeOperation, { kind: 'activity' }> {
  return operation.kind === 'activity';
}

describe('event history parser', () => {
  it('creates a semantic trace for the basic order history', async () => {
    const history = await Bun.file(historyFile).json();
    const trace = parseEventHistory({
      history,
      projectRoot: 'fixtures/basic-order',
      historyHash: 'fixture-history-hash',
      traceId: 'success',
      provenance: {
        workflowId: 'basic-order-success',
        workflowType: 'basicOrderWorkflow',
        temporalSdkVersion: '^1.18.1',
      },
    });
    const activities = trace.operations.filter(isActivityOperation);

    expect(validateArtifact(trace).success).toBe(true);
    expect(trace.execution.workflowType).toBe('basicOrderWorkflow');
    expect(trace.execution.workflowId).toBe('basic-order-success');
    expect(trace.execution.runId).toBe('success-run-id');
    expect(trace.execution.status).toBe('completed');
    expect(trace.execution.startedAt).toBe('2026-01-01T00:00:00.001Z');
    expect(trace.execution.closedAt).toBe('2026-01-01T00:00:00.023Z');
    expect(activities.map((activity) => activity.activityType)).toEqual([
      'validateOrder',
      'chargeCard',
      'shipOrder',
    ]);
    expect(activities.map((activity) => activity.status)).toEqual([
      'completed',
      'completed',
      'completed',
    ]);
    expect(activities.map((activity) => activity.attempts[0]?.closedEventId)).toEqual([7, 13, 19]);
    expect(trace.payloads.length).toBeGreaterThan(0);
    expect(trace.payloads.every((payload) => !payload.decoded && payload.redacted)).toBe(true);
    expect(trace.source.eventCount).toBe(23);
    expect(trace.diagnostics).toEqual([]);
  });

  it('records diagnostics for unknown Event History event types', () => {
    const trace = parseEventHistory({
      history: {
        events: [
          {
            eventId: '1',
            eventTime: '2026-01-01T00:00:00.001Z',
            eventType: 1,
            workflowExecutionStartedEventAttributes: {
              workflowType: { name: 'unknownEventWorkflow' },
              originalExecutionRunId: 'unknown-run',
            },
          },
          {
            eventId: '2',
            eventTime: '2026-01-01T00:00:00.002Z',
            eventType: 999,
          },
        ],
      },
      historyHash: 'unknown-history-hash',
    });

    expect(trace.diagnostics).toHaveLength(1);
    expect(trace.diagnostics[0]?.code).toBe('TEH_UNKNOWN_EVENT_TYPE');
    expect(trace.operations.map((operation) => operation.kind)).toEqual(['workflow-lifecycle']);
  });
});
