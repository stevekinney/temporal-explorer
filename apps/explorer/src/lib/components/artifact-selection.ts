import type {
  ExecutionOverlayDocument,
  ExplorerArtifacts,
  RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

type Workflow = ExplorerArtifacts['analysis']['workflows'][number];

export function traceMatchesRequest(
  trace: RuntimeTraceDocument,
  requestedTrace: string | undefined,
): boolean {
  return Boolean(
    requestedTrace &&
    (trace.artifactId.includes(`trace:${requestedTrace}:`) ||
      trace.execution.workflowId === requestedTrace ||
      trace.execution.runId === requestedTrace),
  );
}

function workflowIdsFromOverlay(overlay: ExecutionOverlayDocument | undefined): string[] {
  return (
    overlay?.staticNodes.filter((node) => node.kind === 'workflow').map((node) => node.id) ?? []
  );
}

function overlayBelongsToWorkflow(overlay: ExecutionOverlayDocument, workflow: Workflow): boolean {
  const workflowIds = workflowIdsFromOverlay(overlay);

  if (workflowIds.length > 0) {
    return workflowIds.includes(workflow.id);
  }

  return overlay.workflow === workflow.name || overlay.workflow === workflow.implementationName;
}

export function overlaysForWorkflow(
  artifacts: ExplorerArtifacts,
  workflow: Workflow | undefined,
): ExecutionOverlayDocument[] {
  if (!workflow) {
    return [];
  }

  return artifacts.overlays.filter((overlay) => overlayBelongsToWorkflow(overlay, workflow));
}

function unambiguousWorkflowByRuntimeName(
  artifacts: ExplorerArtifacts,
  workflowType: string,
): Workflow | undefined {
  const matches = artifacts.analysis.workflows.filter(
    (workflow) => workflow.name === workflowType || workflow.implementationName === workflowType,
  );

  return matches.length === 1 ? matches[0] : undefined;
}

export function defaultWorkflowId(
  artifacts: ExplorerArtifacts,
  requestedTrace: string | undefined,
): string {
  if (requestedTrace) {
    const matchedTrace = artifacts.traces.find((trace) =>
      traceMatchesRequest(trace, requestedTrace),
    );
    const matchedOverlay = matchedTrace
      ? artifacts.overlays.find((overlay) => overlay.runtimeTraceId === matchedTrace.artifactId)
      : undefined;
    const overlayWorkflowId = workflowIdsFromOverlay(matchedOverlay).find((workflowId) =>
      artifacts.analysis.workflows.some((workflow) => workflow.id === workflowId),
    );

    if (overlayWorkflowId) {
      return overlayWorkflowId;
    }

    const tracedWorkflow = matchedTrace
      ? unambiguousWorkflowByRuntimeName(artifacts, matchedTrace.execution.workflowType)
      : undefined;

    if (tracedWorkflow) {
      return tracedWorkflow.id;
    }
  }

  return artifacts.analysis.workflows[0]?.id ?? '';
}
