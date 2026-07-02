import type { ExecutionOverlayDocument, RuntimeTraceDocument } from '@temporal-explorer/schemas';

export type AggregateNodeCoverage = {
  nodeId: string;
  kind: string;
  name: string;
  observedRuns: number;
  totalRuns: number;
};

export type AggregateActivityStats = {
  activityType: string;
  executions: number;
  retried: number;
  failed: number;
};

export type AggregateReport = {
  workflowType: string;
  runs: number;
  statuses: Record<string, number>;
  activities: AggregateActivityStats[];
  signals: Record<string, number>;
  updates: Record<string, number>;
  timers: { fired: number; canceled: number; pending: number };
  hotPathNodes: AggregateNodeCoverage[];
  rareBranchNodes: AggregateNodeCoverage[];
  nodes: AggregateNodeCoverage[];
};

export type CreateAggregateReportOptions = {
  workflowType: string;
  traces: RuntimeTraceDocument[];
  overlays: ExecutionOverlayDocument[];
};

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function aggregateActivities(traces: RuntimeTraceDocument[]): AggregateActivityStats[] {
  const stats = new Map<string, AggregateActivityStats>();

  for (const trace of traces) {
    for (const operation of trace.operations) {
      if (operation.kind !== 'activity') {
        continue;
      }

      const entry = stats.get(operation.activityType) ?? {
        activityType: operation.activityType,
        executions: 0,
        retried: 0,
        failed: 0,
      };
      entry.executions += 1;

      if (
        operation.attempts.length > 1 ||
        operation.attempts.some((attempt) => attempt.attempt > 1)
      ) {
        entry.retried += 1;
      }

      if (operation.status !== 'completed') {
        entry.failed += 1;
      }

      stats.set(operation.activityType, entry);
    }
  }

  return [...stats.values()].toSorted(
    (left, right) =>
      right.retried - left.retried ||
      right.failed - left.failed ||
      left.activityType.localeCompare(right.activityType),
  );
}

function aggregateNodes(overlays: ExecutionOverlayDocument[]): AggregateNodeCoverage[] {
  const nodes = new Map<string, AggregateNodeCoverage>();

  for (const overlay of overlays) {
    for (const node of overlay.staticNodes) {
      const entry = nodes.get(node.id) ?? {
        nodeId: node.id,
        kind: node.kind,
        name: node.name,
        observedRuns: 0,
        totalRuns: 0,
      };
      entry.totalRuns += 1;

      if (node.observed) {
        entry.observedRuns += 1;
      }

      nodes.set(node.id, entry);
    }
  }

  return [...nodes.values()].toSorted((left, right) => left.nodeId.localeCompare(right.nodeId));
}

function aggregateTimers(traces: RuntimeTraceDocument[]): AggregateReport['timers'] {
  const timers = { fired: 0, canceled: 0, pending: 0 };

  for (const trace of traces) {
    for (const operation of trace.operations) {
      if (operation.kind === 'timer') {
        timers[operation.status] += 1;
      }
    }
  }

  return timers;
}

/**
 * Aggregates many executions of one Workflow type into retry hot spots,
 * failure counts, message frequencies, hot paths, and rare branches. Works
 * over local JSON artifacts only.
 */
export function createAggregateReport(options: CreateAggregateReportOptions): AggregateReport {
  const traces = options.traces.filter(
    (trace) => trace.execution.workflowType === options.workflowType,
  );
  const overlays = options.overlays.filter((overlay) => overlay.workflow === options.workflowType);

  if (traces.length === 0) {
    throw new Error(`No trace artifacts matched Workflow type "${options.workflowType}".`);
  }

  const nodes = aggregateNodes(overlays);

  return {
    workflowType: options.workflowType,
    runs: traces.length,
    statuses: countBy(traces.map((trace) => trace.execution.status)),
    activities: aggregateActivities(traces),
    signals: countBy(
      traces.flatMap((trace) =>
        trace.operations.flatMap((operation) =>
          operation.kind === 'signal' ? [operation.signalName] : [],
        ),
      ),
    ),
    updates: countBy(
      traces.flatMap((trace) =>
        trace.operations.flatMap((operation) =>
          operation.kind === 'update' ? [operation.updateName] : [],
        ),
      ),
    ),
    timers: aggregateTimers(traces),
    hotPathNodes: nodes.filter(
      (node) => node.totalRuns > 0 && node.observedRuns === node.totalRuns,
    ),
    // Observed at least once but in at most half of the runs.
    rareBranchNodes: nodes.filter(
      (node) => node.observedRuns > 0 && node.observedRuns * 2 <= node.totalRuns,
    ),
    nodes,
  };
}

/** Formats an aggregate report for terminal output. */
export function formatAggregateReport(report: AggregateReport): string {
  const lines = [
    `Aggregate Report: ${report.workflowType}`,
    '',
    `Runs: ${report.runs}`,
    `Statuses: ${Object.entries(report.statuses)
      .map(([status, count]) => `${status}=${count}`)
      .join(', ')}`,
    '',
    'Activities (by retries, failures)',
  ];

  for (const activity of report.activities) {
    lines.push(
      `  ${activity.activityType}: ${activity.executions} execution(s), ${activity.retried} retried, ${activity.failed} failed`,
    );
  }

  if (Object.keys(report.signals).length > 0) {
    lines.push('', 'Signals received');

    for (const [name, count] of Object.entries(report.signals)) {
      lines.push(`  ${name}: ${count}`);
    }
  }

  if (Object.keys(report.updates).length > 0) {
    lines.push('', 'Updates received');

    for (const [name, count] of Object.entries(report.updates)) {
      lines.push(`  ${name}: ${count}`);
    }
  }

  lines.push(
    '',
    `Timers: ${report.timers.fired} fired, ${report.timers.canceled} canceled, ${report.timers.pending} pending`,
  );

  lines.push('', 'Path coverage');

  for (const node of report.nodes) {
    lines.push(
      `  ${node.kind} ${node.name}: observed in ${node.observedRuns}/${node.totalRuns} run(s)`,
    );
  }

  if (report.rareBranchNodes.length > 0) {
    lines.push('', 'Rare branches (observed in at most half of runs)');

    for (const node of report.rareBranchNodes) {
      lines.push(`  ${node.kind} ${node.name}: ${node.observedRuns}/${node.totalRuns}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
