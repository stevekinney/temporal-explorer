import type {
  ExecutionOverlayDocument,
  SourceLocation,
  TemporalAnalysisDocument,
  TemporalCommand,
  WorkflowDefinition,
} from '@temporal-explorer/schemas';

/**
 * A workflow's stable, unique identity for file names and static lookups. It is
 * the implementation function's own name (which the Workflow `id` also derives
 * from), so it stays unique even when several implementations register under the
 * same display `name` via aliased re-exports (worker versioning). Runtime
 * matching (traces/overlays) must NOT use this — the runtime only records the
 * registered name — so those stay keyed on `name`.
 */
export function workflowSlug(workflow: WorkflowDefinition): string {
  return workflow.implementationName ?? workflow.name;
}

function resolveUnique(
  matches: WorkflowDefinition[],
  workflowKey: string,
): WorkflowDefinition | undefined {
  if (matches.length > 1) {
    const slugs = matches.map(workflowSlug).join(', ');
    throw new Error(
      `Workflow "${workflowKey}" is ambiguous across implementations (${slugs}); use one of those names.`,
    );
  }

  return matches[0];
}

/**
 * Finds a workflow by its unique slug (implementation name) or, failing that, by
 * its registered display name, returning `undefined` when neither matches.
 * Resolving the slug first keeps versioned workflows — which share a display
 * name — individually addressable; a key shared by several implementations
 * throws rather than silently resolving to an arbitrary one.
 */
export function findWorkflow(
  analysis: TemporalAnalysisDocument,
  workflowKey: string,
): WorkflowDefinition | undefined {
  const bySlug = resolveUnique(
    analysis.workflows.filter((candidate) => workflowSlug(candidate) === workflowKey),
    workflowKey,
  );

  if (bySlug) {
    return bySlug;
  }

  return resolveUnique(
    analysis.workflows.filter((candidate) => candidate.name === workflowKey),
    workflowKey,
  );
}

/** Like {@link findWorkflow} but throws a clear error when no workflow matches. */
export function getWorkflow(
  analysis: TemporalAnalysisDocument,
  workflowKey: string,
): WorkflowDefinition {
  const workflow = findWorkflow(analysis, workflowKey);

  if (!workflow) {
    throw new Error(`Workflow "${workflowKey}" was not found.`);
  }

  return workflow;
}

/**
 * Sorts workflows by display name for deterministic output, breaking ties on the
 * unique slug so versioned workflows sharing a name keep a stable order.
 */
export function sortWorkflows(workflows: WorkflowDefinition[]): WorkflowDefinition[] {
  return workflows.toSorted(
    (left, right) =>
      left.name.localeCompare(right.name) || workflowSlug(left).localeCompare(workflowSlug(right)),
  );
}

/** Returns a workflow's commands of one kind in static order. */
export function getCommandsOfKind(
  workflow: WorkflowDefinition,
  kind: TemporalCommand['kind'],
): TemporalCommand[] {
  return workflow.temporalCommands
    .filter((command) => command.kind === kind)
    .toSorted((left, right) => left.staticOrder - right.staticOrder);
}

/** Formats a source location as `path:line`. */
export function formatSource(value: { source: SourceLocation }): string {
  return `${value.source.path}:${value.source.start.line}`;
}

/** Finds the overlay generated for a workflow, if one was provided. */
export function getOverlayForWorkflow(
  workflow: WorkflowDefinition,
  overlays: ExecutionOverlayDocument[],
): ExecutionOverlayDocument | undefined {
  return overlays.find((overlay) => overlay.workflow === workflow.name);
}

/** Reports whether a static node was observed in the overlay. */
export function isObserved(nodeId: string, overlay: ExecutionOverlayDocument | undefined): boolean {
  return Boolean(overlay?.staticNodes.some((node) => node.id === nodeId && node.observed));
}

/** Returns the mapping confidence recorded for a static node. */
export function getMappingConfidence(
  nodeId: string,
  overlay: ExecutionOverlayDocument | undefined,
): string {
  return (
    overlay?.mappings.find((mapping) => mapping.staticNodeId === nodeId)?.confidence ?? 'unknown'
  );
}

/** Formats a workflow signature as `name(args): result`, honoring `...rest` and `?optional`. */
export function formatWorkflowSignature(workflow: WorkflowDefinition): string {
  const args = workflow.signature.args
    .map((arg) => {
      const rest = arg.isRest ? '...' : '';
      const optional = arg.optional ? '?' : '';
      return `${rest}${arg.displayName ?? 'arg'}${optional}: ${arg.display}`;
    })
    .join(', ');

  return `${workflow.name}(${args}): ${workflow.signature.result.display}`;
}

/** Command display name with a `(deprecated)` marker for `deprecatePatch()` patches. */
export function commandDisplayName(command: TemporalCommand): string {
  return command.deprecated ? `${command.name} (deprecated)` : command.name;
}

/** Creates a Prettier-compatible aligned Markdown table. */
export function createAlignedMarkdownTable(
  headers: string[],
  alignments: ('left' | 'right')[],
  rows: string[][],
): string[] {
  const tableRows = [headers, ...rows];
  const widths = headers.map((_, columnIndex) =>
    Math.max(...tableRows.map((row) => row[columnIndex]?.length ?? 0)),
  );
  const separator = widths.map((width, columnIndex) => {
    const dashCount = Math.max(width - (alignments[columnIndex] === 'right' ? 1 : 0), 3);
    return alignments[columnIndex] === 'right'
      ? `${'-'.repeat(dashCount)}:`
      : '-'.repeat(dashCount);
  });

  return [
    formatAlignedTableRow(headers, widths, alignments),
    formatAlignedTableRow(separator, widths, alignments),
    ...rows.map((row) => formatAlignedTableRow(row, widths, alignments)),
  ];
}

function formatAlignedTableRow(
  cells: string[],
  widths: number[],
  alignments: ('left' | 'right')[],
): string {
  return `| ${cells
    .map((cell, index) =>
      alignments[index] === 'right'
        ? cell.padStart(widths[index] ?? 0)
        : cell.padEnd(widths[index] ?? 0),
    )
    .join(' | ')} |`;
}
