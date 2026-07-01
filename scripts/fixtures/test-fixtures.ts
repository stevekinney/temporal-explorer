import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  validateArtifact,
} from '@temporal-explorer/schemas';

function getFixtureName(): string {
  const index = Bun.argv.indexOf('--fixture');
  return index >= 0 ? (Bun.argv[index + 1] ?? '') : '';
}

async function testBasicOrderHistoryFixture(): Promise<void> {
  const tracePath = new URL(
    '../../fixtures/basic-order/.temporal-explorer/histories/success.trace.json',
    import.meta.url,
  );
  const traceJson = await Bun.file(tracePath).json();
  const validation = validateArtifact(traceJson);

  if (!validation.success) {
    const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`${tracePath.pathname} failed schema validation:\n${issues}`);
  }

  const trace = runtimeTraceDocumentSchema.parse(traceJson);
  const activities = trace.operations.filter((operation) => operation.kind === 'activity');

  if (trace.execution.workflowType !== 'basicOrderWorkflow') {
    throw new Error(`Expected basicOrderWorkflow, received ${trace.execution.workflowType}.`);
  }

  if (trace.execution.status !== 'completed') {
    throw new Error(`Expected completed execution, received ${trace.execution.status}.`);
  }

  if (activities.length !== 3) {
    throw new Error(`Expected 3 Activity executions, received ${activities.length}.`);
  }

  if (!trace.payloads.every((payload) => !payload.decoded && payload.redacted)) {
    throw new Error('Expected payload previews to stay redacted by default.');
  }

  console.log('basic-order-history fixture passed.');
}

async function testBasicOrderOverlayFixture(): Promise<void> {
  const overlayPath = new URL(
    '../../fixtures/basic-order/.temporal-explorer/overlays/success.overlay.json',
    import.meta.url,
  );
  const overlayJson = await Bun.file(overlayPath).json();
  const validation = validateArtifact(overlayJson);

  if (!validation.success) {
    const issues = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`${overlayPath.pathname} failed schema validation:\n${issues}`);
  }

  const overlay = executionOverlayDocumentSchema.parse(overlayJson);
  const activityMappings = overlay.mappings.filter((mapping) =>
    mapping.staticNodeId?.startsWith('activity-call:'),
  );

  if (activityMappings.length !== 3) {
    throw new Error(`Expected 3 mapped Activity operations, received ${activityMappings.length}.`);
  }

  if (overlay.coverage.nodes.unmappedRuntimeOperations !== 0) {
    throw new Error('Expected zero unmapped runtime operations.');
  }

  if (!activityMappings.every((mapping) => mapping.confidence === 'exact')) {
    throw new Error('Expected all Activity mappings to have exact confidence.');
  }

  console.log('basic-order-overlay fixture passed.');
}

const fixtureName = getFixtureName();

if (fixtureName === 'basic-order-history') {
  await testBasicOrderHistoryFixture();
} else if (fixtureName === 'basic-order-overlay') {
  await testBasicOrderOverlayFixture();
} else {
  throw new Error(`Unsupported fixture test: ${fixtureName || '<missing>'}.`);
}
