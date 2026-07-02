import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
  validateArtifact,
  type ExecutionOverlayDocument,
  type RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

export async function loadTrace(fixture: string, history: string): Promise<RuntimeTraceDocument> {
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

export async function loadOverlay(
  fixture: string,
  history: string,
): Promise<ExecutionOverlayDocument> {
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

export function expect(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}
