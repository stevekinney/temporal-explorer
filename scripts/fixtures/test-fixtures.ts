import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  validateArtifact,
  type ExecutionOverlayDocument,
  type RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

function getFixtureName(): string {
  const index = Bun.argv.indexOf('--fixture');
  return index >= 0 ? (Bun.argv[index + 1] ?? '') : '';
}

async function loadTrace(fixture: string, history: string): Promise<RuntimeTraceDocument> {
  const tracePath = new URL(
    `../../fixtures/${fixture}/.temporal-explorer/histories/${history}.trace.json`,
    import.meta.url,
  );
  const traceJson = await Bun.file(tracePath).json();
  const validation = validateArtifact(traceJson);

  if (!validation.success) {
    const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`${tracePath.pathname} failed schema validation:\n${issues}`);
  }

  return runtimeTraceDocumentSchema.parse(traceJson);
}

async function loadOverlay(fixture: string, history: string): Promise<ExecutionOverlayDocument> {
  const overlayPath = new URL(
    `../../fixtures/${fixture}/.temporal-explorer/overlays/${history}.overlay.json`,
    import.meta.url,
  );
  const overlayJson = await Bun.file(overlayPath).json();
  const validation = validateArtifact(overlayJson);

  if (!validation.success) {
    const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`${overlayPath.pathname} failed schema validation:\n${issues}`);
  }

  return executionOverlayDocumentSchema.parse(overlayJson);
}

function expect(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}.`);
  }
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

const fixtureTests = new Map<string, () => Promise<void>>([
  ['basic-order-history', testBasicOrderHistoryFixture],
  ['basic-order-overlay', testBasicOrderOverlayFixture],
  ['approval', testApprovalFixture],
  ['timer-race', testTimerRaceFixture],
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
