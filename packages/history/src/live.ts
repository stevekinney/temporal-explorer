import { Client, Connection } from '@temporalio/client';

import type { RuntimeTraceDocument } from '@temporal-explorer/schemas';

import { convertProtoHistory } from './proto-history';
import { parseEventHistory, type ParseEventHistoryOptions } from './trace-builder';

/** Connection details resolved from a temporal-explorer.config.ts profile. */
export type LiveConnectionOptions = {
  address: string;
  namespace?: string | undefined;
  apiKey?: string | undefined;
  tls?:
    | {
        enabled: boolean;
        serverNameOverride?: string;
      }
    | undefined;
};

export type LiveClient = {
  client: Client;
  namespace: string;
  close(): Promise<void>;
};

/** Connects to an existing Temporal instance described by a connection profile. */
export async function createLiveClient(options: LiveConnectionOptions): Promise<LiveClient> {
  const namespace = options.namespace ?? 'default';
  const connection = await Connection.connect({
    address: options.address,
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(options.tls?.enabled
      ? {
          tls: options.tls.serverNameOverride
            ? { serverNameOverride: options.tls.serverNameOverride }
            : true,
        }
      : {}),
  });

  return {
    client: new Client({ connection, namespace }),
    namespace,
    close: async () => {
      await connection.close();
    },
  };
}

export type WorkflowRunSummary = {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: string;
  startedAt?: string;
  closedAt?: string;
  taskQueue?: string;
};

export type ListWorkflowRunsOptions = {
  client: Client;
  workflowType?: string | undefined;
  workflowId?: string | undefined;
  status?: string | undefined;
  query?: string | undefined;
  limit?: number | undefined;
};

function buildListQuery(options: ListWorkflowRunsOptions): string | undefined {
  if (options.query) {
    return options.query;
  }

  const clauses: string[] = [];

  if (options.workflowType) {
    clauses.push(`WorkflowType='${options.workflowType}'`);
  }

  if (options.workflowId) {
    clauses.push(`WorkflowId='${options.workflowId}'`);
  }

  if (options.status) {
    clauses.push(`ExecutionStatus='${options.status}'`);
  }

  return clauses.length > 0 ? clauses.join(' AND ') : undefined;
}

/** Lists Workflow Executions on the connected Temporal instance. */
export async function listWorkflowRuns(
  options: ListWorkflowRunsOptions,
): Promise<WorkflowRunSummary[]> {
  const query = buildListQuery(options);
  const limit = options.limit ?? 50;
  const runs: WorkflowRunSummary[] = [];

  for await (const execution of options.client.workflow.list(query ? { query } : {})) {
    runs.push({
      workflowId: execution.workflowId,
      runId: execution.runId,
      workflowType: execution.type,
      status: execution.status.name,
      ...(execution.startTime ? { startedAt: execution.startTime.toISOString() } : {}),
      ...(execution.closeTime ? { closedAt: execution.closeTime.toISOString() } : {}),
      ...(execution.taskQueue ? { taskQueue: execution.taskQueue } : {}),
    });

    if (runs.length >= limit) {
      break;
    }
  }

  return runs;
}

export type FetchEventHistoryOptions = Omit<
  ParseEventHistoryOptions,
  'history' | 'importedFrom'
> & {
  client: Client;
  workflowId: string;
  runId?: string | undefined;
};

/**
 * Fetches a Workflow Execution's Event History from a connected Temporal
 * instance and parses it through the exact pipeline file imports use, so
 * live runs and imported files produce identical trace artifacts.
 */
export async function fetchEventHistory(
  options: FetchEventHistoryOptions,
): Promise<{ trace: RuntimeTraceDocument; runId: string }> {
  const handle = options.client.workflow.getHandle(options.workflowId, options.runId);
  const description = await handle.describe();
  const history = convertProtoHistory(await handle.fetchHistory());
  const { client: _client, workflowId, runId, ...parseOptions } = options;
  void _client;
  void runId;

  const trace = parseEventHistory({
    ...parseOptions,
    history,
    importedFrom: 'api',
    traceId: options.traceId ?? `${workflowId}.${description.runId}`,
    provenance: options.provenance ?? {
      workflowId,
      workflowType: description.type,
    },
  });

  return { trace, runId: description.runId };
}
