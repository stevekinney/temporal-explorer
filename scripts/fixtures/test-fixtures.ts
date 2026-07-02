import { expect, loadOverlay, loadTrace } from './fixture-assertions';

function getFixtureName(): string {
  const index = Bun.argv.indexOf('--fixture');
  return index >= 0 ? (Bun.argv[index + 1] ?? '') : '';
}

async function testBasicOrderHistoryFixture(): Promise<void> {
  const trace = await loadTrace('basic-order', 'success');
  const activities = trace.operations.filter((operation) => operation.kind === 'activity');

  expect(trace.execution.workflowType, 'basicOrderWorkflow', 'workflowType');
  expect(trace.execution.status, 'completed', 'status');
  expect(activities.length, 3, 'activity count');

  if (!trace.payloads.every((payload) => !payload.decoded && payload.redacted)) {
    throw new Error('Expected payload previews to stay redacted by default.');
  }

  console.log('basic-order-history fixture passed.');
}

async function testBasicOrderOverlayFixture(): Promise<void> {
  const overlay = await loadOverlay('basic-order', 'success');
  const activityMappings = overlay.mappings.filter((mapping) =>
    mapping.staticNodeId?.startsWith('activity-call:'),
  );

  expect(activityMappings.length, 3, 'mapped activity operations');
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'unmapped operations');

  if (!activityMappings.every((mapping) => mapping.confidence === 'exact')) {
    throw new Error('Expected all Activity mappings to have exact confidence.');
  }

  console.log('basic-order-overlay fixture passed.');
}

async function testApprovalFixture(): Promise<void> {
  const trace = await loadTrace('approval', 'approved');
  const signals = trace.operations.filter((operation) => operation.kind === 'signal');

  expect(signals.length, 1, 'signal deliveries');
  expect(signals[0]?.kind === 'signal' && signals[0].signalName, 'approve', 'signal name');

  const overlay = await loadOverlay('approval', 'approved');
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'unmapped operations');
  expect(overlay.coverage.messages.staticSignals, 1, 'static signals');
  expect(overlay.coverage.messages.receivedSignals.join(','), 'approve', 'received signals');

  const signalNode = overlay.staticNodes.find((node) => node.kind === 'signal');
  expect(signalNode?.observed, true, 'signal node observed');

  console.log('approval fixture passed.');
}

async function testTimerRaceFixture(): Promise<void> {
  const signalWins = await loadOverlay('timer-race', 'signal-wins');
  expect(signalWins.coverage.timers.canceled, 1, 'signal-wins canceled timers');
  expect(signalWins.coverage.timers.fired, 0, 'signal-wins fired timers');
  expect(signalWins.coverage.nodes.unmappedRuntimeOperations, 0, 'signal-wins unmapped');

  const approvedNode = signalWins.staticNodes.find((node) => node.name === 'notifyApproved');
  const expiredNode = signalWins.staticNodes.find((node) => node.name === 'notifyExpired');
  expect(approvedNode?.observed, true, 'signal-wins notifyApproved observed');
  expect(expiredNode?.observed, false, 'signal-wins notifyExpired skipped');

  const timeout = await loadOverlay('timer-race', 'timeout');
  expect(timeout.coverage.timers.fired, 1, 'timeout fired timers');
  expect(timeout.coverage.timers.canceled, 0, 'timeout canceled timers');
  expect(timeout.coverage.nodes.unmappedRuntimeOperations, 0, 'timeout unmapped');

  const timeoutApproved = timeout.staticNodes.find((node) => node.name === 'notifyApproved');
  const timeoutExpired = timeout.staticNodes.find((node) => node.name === 'notifyExpired');
  expect(timeoutApproved?.observed, false, 'timeout notifyApproved skipped');
  expect(timeoutExpired?.observed, true, 'timeout notifyExpired observed');

  console.log('timer-race fixture passed.');
}

async function testQueryFixture(): Promise<void> {
  const trace = await loadTrace('query', 'completed');
  const overlay = await loadOverlay('query', 'completed');

  // Queries are served from Workflow state; the committed history proves they
  // add no events while the static surface still exposes them.
  expect(trace.source.eventCount, 15, 'query history event count');
  expect(overlay.coverage.messages.staticQueries, 3, 'static queries');
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'query unmapped');

  const queryNodes = overlay.staticNodes.filter((node) => node.kind === 'query');
  expect(queryNodes.length, 3, 'query nodes');
  expect(
    queryNodes.every((node) => !node.observed),
    true,
    'query nodes unobservable',
  );

  console.log('query fixture passed.');
}

async function testUpdateFixture(): Promise<void> {
  const trace = await loadTrace('update', 'updates');
  const updates = trace.operations.filter((operation) => operation.kind === 'update');

  expect(updates.length, 2, 'update operations');
  expect(updates[0]?.kind === 'update' && updates[0].status, 'completed', 'first update status');
  expect(updates[1]?.kind === 'update' && updates[1].status, 'failed', 'second update status');

  const overlay = await loadOverlay('update', 'updates');
  expect(overlay.coverage.messages.staticUpdates, 2, 'static updates');
  expect(
    overlay.coverage.messages.receivedUpdates.join(','),
    'explode,setAddress',
    'received updates',
  );
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'update unmapped');

  console.log('update fixture passed.');
}

async function testRetryFixture(): Promise<void> {
  const success = await loadTrace('retry', 'retry-success');
  const successActivity = success.operations.find((operation) => operation.kind === 'activity');

  expect(
    successActivity?.kind === 'activity' && successActivity.attempts[0]?.attempt,
    3,
    'retry-success attempt number',
  );
  expect(
    successActivity?.kind === 'activity' && successActivity.status,
    'completed',
    'retry-success status',
  );

  const successOverlay = await loadOverlay('retry', 'retry-success');
  expect(successOverlay.coverage.activities.retried, 1, 'retried count');

  const failure = await loadTrace('retry', 'failure');
  const failedActivity = failure.operations.find((operation) => operation.kind === 'activity');
  expect(failure.execution.status, 'failed', 'failure execution status');
  expect(
    failedActivity?.kind === 'activity' && failedActivity.status,
    'failed',
    'failure activity status',
  );

  const failureOverlay = await loadOverlay('retry', 'failure');
  expect(failureOverlay.coverage.activities.failed, 1, 'failed count');
  expect(failureOverlay.coverage.nodes.unmappedRuntimeOperations, 0, 'retry unmapped');

  console.log('retry fixture passed.');
}

async function testChildWorkflowFixture(): Promise<void> {
  const trace = await loadTrace('child-workflow', 'success');
  const children = trace.operations.filter((operation) => operation.kind === 'child-workflow');

  expect(children.length, 2, 'child workflow operations');
  expect(
    children.every((child) => child.kind === 'child-workflow' && child.status === 'completed'),
    true,
    'child statuses',
  );

  const overlay = await loadOverlay('child-workflow', 'success');
  const childNodes = overlay.staticNodes.filter((node) => node.kind === 'child-workflow');
  expect(childNodes.length, 2, 'child workflow nodes');
  expect(
    childNodes.every((node) => node.observed),
    true,
    'child nodes observed',
  );
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'child unmapped');

  console.log('child-workflow fixture passed.');
}

async function testExternalFixture(): Promise<void> {
  const trace = await loadTrace('external', 'signaled');
  const external = trace.operations.find((operation) => operation.kind === 'external-signal');

  expect(external?.kind === 'external-signal' && external.signalName, 'release', 'external signal');
  expect(external?.kind === 'external-signal' && external.status, 'signaled', 'external status');
  expect(
    external?.kind === 'external-signal' && external.targetWorkflowId,
    'external-target-1',
    'external target',
  );

  const overlay = await loadOverlay('external', 'signaled');
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'external unmapped');

  console.log('external fixture passed.');
}

async function testCancellationFixture(): Promise<void> {
  const trace = await loadTrace('cancellation', 'canceled');
  expect(trace.execution.status, 'canceled', 'cancellation status');

  const overlay = await loadOverlay('cancellation', 'canceled');
  const byName = new Map(overlay.staticNodes.map((node) => [node.name, node]));

  expect(byName.get('useResources')?.observed, false, 'canceled work skipped');
  expect(byName.get('releaseResources')?.observed, true, 'cleanup observed');
  expect(byName.get('cancellable')?.observed, true, 'cancellable scope observed');
  expect(byName.get('nonCancellable')?.observed, true, 'cleanup scope observed');
  expect(overlay.coverage.timers.canceled, 1, 'canceled timer');
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'cancellation unmapped');

  console.log('cancellation fixture passed.');
}

async function testContinueAsNewFixture(): Promise<void> {
  const trace = await loadTrace('continue-as-new', 'rollover');
  expect(trace.execution.status, 'continued-as-new', 'rollover status');
  expect(
    trace.operations.some((operation) => operation.kind === 'continue-as-new'),
    true,
    'continue-as-new operation',
  );

  const overlay = await loadOverlay('continue-as-new', 'rollover');
  const rolloverNode = overlay.staticNodes.find((node) => node.kind === 'continue-as-new');
  expect(rolloverNode?.observed, true, 'continue-as-new node observed');
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'rollover unmapped');

  console.log('continue-as-new fixture passed.');
}

async function testPatchedFixture(): Promise<void> {
  const trace = await loadTrace('patched', 'patched-run');
  const markers = trace.operations.filter((operation) => operation.kind === 'marker');
  expect(markers.length, 2, 'patch markers');

  const overlay = await loadOverlay('patched', 'patched-run');
  const byName = new Map(overlay.staticNodes.map((node) => [node.name, node]));
  expect(byName.get('newCharge')?.observed, true, 'patched branch observed');
  expect(byName.get('oldCharge')?.observed, false, 'legacy branch skipped');
  expect(byName.get('use-modern-charge')?.observed, true, 'patch marker mapped');
  expect(byName.get('legacy-tax-rounding')?.observed, true, 'deprecated patch mapped');
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'patched unmapped');

  console.log('patched fixture passed.');
}

async function testDynamicFixture(): Promise<void> {
  const overlay = await loadOverlay('dynamic', 'planned');
  const dynamicMappings = overlay.mappings.filter((mapping) =>
    mapping.staticNodeId?.startsWith('dynamic:'),
  );

  expect(dynamicMappings.length, 2, 'dynamic mappings');
  expect(
    dynamicMappings.every((mapping) => mapping.confidence === 'dynamic'),
    true,
    'dynamic confidence',
  );
  expect(
    dynamicMappings.every((mapping) =>
      mapping.evidence.some((evidence) => evidence.kind === 'dynamic-dispatch'),
    ),
    true,
    'dynamic evidence',
  );
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'dynamic unmapped');

  console.log('dynamic fixture passed.');
}

async function testPayloadsFixture(): Promise<void> {
  const trace = await loadTrace('payloads', 'encrypted');

  // Encrypted payloads must stay opaque while the trace remains fully useful.
  expect(trace.payloads.length > 0, true, 'payload references exist');
  expect(
    trace.payloads.every((payload) => !payload.decoded && payload.redacted),
    true,
    'encrypted payloads stay opaque',
  );

  const overlay = await loadOverlay('payloads', 'encrypted');
  expect(overlay.coverage.nodes.unmappedRuntimeOperations, 0, 'payloads unmapped');

  const raw = await Bun.file(
    new URL(
      '../../fixtures/payloads/.temporal-explorer/histories/encrypted.trace.json',
      import.meta.url,
    ),
  ).text();

  if (raw.includes('hunter2') || raw.includes('4111-1111')) {
    throw new Error('Sensitive fixture values leaked into the trace artifact.');
  }

  console.log('payloads fixture passed.');
}

const fixtureTests = new Map<string, () => Promise<void>>([
  ['basic-order-history', testBasicOrderHistoryFixture],
  ['basic-order-overlay', testBasicOrderOverlayFixture],
  ['approval', testApprovalFixture],
  ['timer-race', testTimerRaceFixture],
  ['query', testQueryFixture],
  ['update', testUpdateFixture],
  ['retry', testRetryFixture],
  ['child-workflow', testChildWorkflowFixture],
  ['external', testExternalFixture],
  ['cancellation', testCancellationFixture],
  ['continue-as-new', testContinueAsNewFixture],
  ['patched', testPatchedFixture],
  ['dynamic', testDynamicFixture],
  ['payloads', testPayloadsFixture],
]);

const fixtureName = getFixtureName();

if (fixtureName) {
  const fixtureTest = fixtureTests.get(fixtureName);

  if (!fixtureTest) {
    throw new Error(`Unsupported fixture test: ${fixtureName}.`);
  }

  await fixtureTest();
} else {
  for (const [name, fixtureTest] of fixtureTests) {
    await fixtureTest();
    void name;
  }
}
