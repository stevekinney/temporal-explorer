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

  it('collapses signal and canceled timer events from the timer-race history', async () => {
    const history = await Bun.file(
      new URL('../../../fixtures/timer-race/histories/signal-wins.json', import.meta.url),
    ).json();
    const trace = parseEventHistory({
      history,
      traceId: 'signal-wins',
      historyHash: 'timer-race-signal-wins-hash',
    });
    const signals = trace.operations.filter((operation) => operation.kind === 'signal');
    const timers = trace.operations.filter((operation) => operation.kind === 'timer');

    expect(validateArtifact(trace).success).toBe(true);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.kind === 'signal' && signals[0].signalName).toBe('approve');
    expect(timers).toHaveLength(1);
    expect(timers[0]?.kind === 'timer' && timers[0].status).toBe('canceled');
    expect(timers[0]?.kind === 'timer' && timers[0].durationText).toBe('2592000s');
    expect(timers[0]?.eventReferences.map((reference) => reference.eventType)).toEqual([
      'TimerStarted',
      'TimerCanceled',
    ]);
    expect(trace.timeline.some((entry) => entry.label === 'Signal approve received')).toBe(true);
    expect(
      trace.payloads.filter((payload) => payload.kind === 'signal').every((p) => p.redacted),
    ).toBe(true);
  });

  it('collapses fired timer events from the timer-race timeout history', async () => {
    const history = await Bun.file(
      new URL('../../../fixtures/timer-race/histories/timeout.json', import.meta.url),
    ).json();
    const trace = parseEventHistory({
      history,
      traceId: 'timeout',
      historyHash: 'timer-race-timeout-hash',
    });
    const timers = trace.operations.filter((operation) => operation.kind === 'timer');

    expect(timers).toHaveLength(1);
    expect(timers[0]?.kind === 'timer' && timers[0].status).toBe('fired');
    expect(trace.timeline.filter((entry) => entry.label.startsWith('Timer'))).toHaveLength(2);
  });

  it('collapses update lifecycle events with success and failure outcomes', async () => {
    const history = await Bun.file(
      new URL('../../../fixtures/update/histories/updates.json', import.meta.url),
    ).json();
    const trace = parseEventHistory({ history, traceId: 'updates', historyHash: 'updates-hash' });
    const updates = trace.operations.filter((operation) => operation.kind === 'update');

    expect(validateArtifact(trace).success).toBe(true);
    expect(
      updates.map((update) => update.kind === 'update' && [update.updateName, update.status]),
    ).toEqual([
      ['setAddress', 'completed'],
      ['explode', 'failed'],
    ]);
    expect(trace.timeline.some((entry) => entry.label === 'Update setAddress accepted')).toBe(true);
  });

  it('collapses child workflow, marker, and cancellation events', async () => {
    const childHistory = await Bun.file(
      new URL('../../../fixtures/child-workflow/histories/success.json', import.meta.url),
    ).json();
    const childTrace = parseEventHistory({
      history: childHistory,
      traceId: 'success',
      historyHash: 'child-hash',
    });
    const children = childTrace.operations.filter(
      (operation) => operation.kind === 'child-workflow',
    );

    expect(
      children.map(
        (child) => child.kind === 'child-workflow' && [child.workflowType, child.status],
      ),
    ).toEqual([
      ['reserveInventoryChild', 'completed'],
      ['releaseNotificationChild', 'completed'],
    ]);

    const patchedHistory = await Bun.file(
      new URL('../../../fixtures/patched/histories/patched-run.json', import.meta.url),
    ).json();
    const patchedTrace = parseEventHistory({
      history: patchedHistory,
      traceId: 'patched-run',
      historyHash: 'patched-hash',
    });
    const markers = patchedTrace.operations.filter((operation) => operation.kind === 'marker');

    expect(
      markers.map(
        (marker) => marker.kind === 'marker' && [marker.patchId, marker.deprecated ?? false],
      ),
    ).toEqual([
      ['legacy-tax-rounding', true],
      ['use-modern-charge', false],
    ]);

    const canceledHistory = await Bun.file(
      new URL('../../../fixtures/cancellation/histories/canceled.json', import.meta.url),
    ).json();
    const canceledTrace = parseEventHistory({
      history: canceledHistory,
      traceId: 'canceled',
      historyHash: 'canceled-hash',
    });

    expect(canceledTrace.execution.status).toBe('canceled');
    expect(canceledTrace.operations.some((operation) => operation.kind === 'cancel-request')).toBe(
      true,
    );
  });

  it('parses continue-as-new and external signal events', async () => {
    const rolloverHistory = await Bun.file(
      new URL('../../../fixtures/continue-as-new/histories/rollover.json', import.meta.url),
    ).json();
    const rolloverTrace = parseEventHistory({
      history: rolloverHistory,
      traceId: 'rollover',
      historyHash: 'rollover-hash',
    });
    const rollover = rolloverTrace.operations.find(
      (operation) => operation.kind === 'continue-as-new',
    );

    expect(rolloverTrace.execution.status).toBe('continued-as-new');
    expect(rollover?.kind === 'continue-as-new' && rollover.newRunId).toBe('rollover-run-id-2');

    const signaledHistory = await Bun.file(
      new URL('../../../fixtures/external/histories/signaled.json', import.meta.url),
    ).json();
    const signaledTrace = parseEventHistory({
      history: signaledHistory,
      traceId: 'signaled',
      historyHash: 'signaled-hash',
    });
    const externalSignal = signaledTrace.operations.find(
      (operation) => operation.kind === 'external-signal',
    );

    expect(
      externalSignal?.kind === 'external-signal' && [
        externalSignal.signalName,
        externalSignal.status,
        externalSignal.targetWorkflowId,
      ],
    ).toEqual(['release', 'signaled', 'external-target-1']);
  });

  it('keeps unclosed timers pending', () => {
    const trace = parseEventHistory({
      history: {
        events: [
          {
            eventId: '1',
            eventTime: '2026-01-01T00:00:00.001Z',
            eventType: 1,
            workflowExecutionStartedEventAttributes: {
              workflowType: { name: 'pendingTimerWorkflow' },
              originalExecutionRunId: 'pending-run',
            },
          },
          {
            eventId: '2',
            eventTime: '2026-01-01T00:00:00.002Z',
            eventType: 17,
            timerStartedEventAttributes: { timerId: '1' },
          },
        ],
      },
      historyHash: 'pending-timer-hash',
    });
    const timers = trace.operations.filter((operation) => operation.kind === 'timer');

    expect(timers).toHaveLength(1);
    expect(timers[0]?.kind === 'timer' && timers[0].status).toBe('pending');
  });
});
