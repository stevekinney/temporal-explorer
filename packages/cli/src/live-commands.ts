import {
  createLiveClient,
  fetchEventHistory,
  listWorkflowRuns,
  loadTemporalExplorerProject,
  type LiveClient,
  type LiveConnectionOptions,
  type WorkflowRunSummary,
} from '@temporal-explorer/api';

import type { ParsedFlags } from './arguments';
import { writeTraceArtifact } from './artifact-files';

async function findConnectionProfile(flags: ParsedFlags, name: string) {
  const project = await loadTemporalExplorerProject(flags.project ? { root: flags.project } : {});
  const profile = project.configuration?.connections?.[name];

  if (!profile) {
    const available = Object.keys(project.configuration?.connections ?? {});
    throw new Error(
      `Connection profile "${name}" was not found in temporal-explorer.config.ts.` +
        (available.length > 0 ? ` Available profiles: ${available.join(', ')}.` : ''),
    );
  }

  if (!profile.address) {
    throw new Error(`Connection profile "${name}" is missing an address.`);
  }

  return profile;
}

function resolveApiKey(
  connectionName: string,
  environmentVariable: string | undefined,
): string | undefined {
  if (!environmentVariable) {
    return undefined;
  }

  const apiKey = Bun.env[environmentVariable];

  if (!apiKey) {
    throw new Error(
      `Connection profile "${connectionName}" expects the ${environmentVariable} environment variable.`,
    );
  }

  return apiKey;
}

/** Resolves a named connection profile from temporal-explorer.config.ts. */
export async function resolveConnection(flags: ParsedFlags): Promise<LiveConnectionOptions> {
  if (!flags.connection) {
    throw new Error('This command requires --connection <profile>.');
  }

  const profile = await findConnectionProfile(flags, flags.connection);
  const apiKey = resolveApiKey(flags.connection, profile.apiKeyEnvironmentVariable);

  return {
    address: profile.address ?? '',
    namespace: profile.namespace,
    ...(apiKey ? { apiKey } : {}),
    ...(profile.tls ? { tls: profile.tls } : {}),
  };
}

async function withLiveClient<T>(
  flags: ParsedFlags,
  callback: (live: LiveClient) => Promise<T>,
): Promise<T> {
  const live = await createLiveClient(await resolveConnection(flags));

  try {
    return await callback(live);
  } finally {
    await live.close();
  }
}

/** Lists Workflow Executions for the configured connection. */
export async function listRuns(flags: ParsedFlags): Promise<WorkflowRunSummary[]> {
  return await withLiveClient(flags, async (live) =>
    listWorkflowRuns({
      client: live.client,
      workflowType: flags['workflow-type'],
      workflowId: flags['workflow-id'],
      status: flags.status,
      query: flags.query,
      ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    }),
  );
}

/** Formats run summaries for terminal output. */
export function formatRuns(runs: WorkflowRunSummary[]): string {
  if (runs.length === 0) {
    return 'No Workflow Executions matched.\n';
  }

  const lines = ['Workflow Executions', ''];

  for (const run of runs) {
    lines.push(`  ${run.workflowId} (${run.runId})`);
    lines.push(`    type: ${run.workflowType}  status: ${run.status}`);

    if (run.startedAt) {
      lines.push(`    started: ${run.startedAt}${run.closedAt ? `  closed: ${run.closedAt}` : ''}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/** Fetches a live Event History and persists the standard trace artifact. */
export async function fetchRunHistory(flags: ParsedFlags): Promise<{
  artifactPath: string;
  workflowType: string;
  eventCount: number;
}> {
  const workflowId = flags['workflow-id'];

  if (!workflowId) {
    throw new Error('history fetch requires --workflow-id.');
  }

  const project = await loadTemporalExplorerProject(flags.project ? { root: flags.project } : {});
  const runId = flags['run-id'] === 'latest' ? undefined : flags['run-id'];
  const { trace, runId: resolvedRunId } = await withLiveClient(flags, async (live) =>
    fetchEventHistory({
      client: live.client,
      workflowId,
      runId,
    }),
  );
  const artifactPath = await writeTraceArtifact(
    project.root,
    trace,
    `${workflowId}.${resolvedRunId}`,
  );

  return {
    artifactPath,
    workflowType: trace.execution.workflowType,
    eventCount: trace.source.eventCount,
  };
}
