import { join } from 'node:path';

import type { ReplayCapturedCommand } from '@temporal-explorer/api';

const interceptorsPath = new URL('replay-interceptors.ts', import.meta.url).pathname;

type ReplayWorker = {
  runReplayHistory(
    options: {
      workflowsPath: string;
      interceptors: { workflowModules: string[] };
      sinks: Record<
        string,
        Record<string, { callDuringReplay: boolean; fn: (...values: unknown[]) => void }>
      >;
    },
    history: unknown,
  ): Promise<void>;
};

type ReplayHistoryJson = {
  events?: Record<string, unknown>[];
};

function isReplayHistoryJson(value: unknown): value is ReplayHistoryJson {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const events: unknown = Reflect.get(value, 'events');
  return events === undefined || Array.isArray(events);
}

async function loadReplayWorker(): Promise<ReplayWorker> {
  try {
    const worker = (await import('@temporalio/worker')) as { Worker: ReplayWorker };
    return worker.Worker;
  } catch {
    throw new Error(
      '--replay requires @temporalio/worker. Install it in the project to enable replay-assisted mapping.',
    );
  }
}

function toIsoEventTimes(history: { events?: Record<string, unknown>[] }): unknown {
  for (const event of history.events ?? []) {
    if (typeof event['eventTime'] === 'string') {
      const milliseconds = Date.parse(event['eventTime']);
      event['eventTime'] = {
        seconds: Math.floor(milliseconds / 1000),
        nanos: (milliseconds % 1000) * 1_000_000,
      };
    }
  }

  return history;
}

/**
 * Replays a raw Event History against the project's Workflow source and
 * captures the scheduled commands in order. Replay stays optional: file-based
 * imports and overlays never require it.
 */
export async function captureReplayCommands(options: {
  projectRoot: string;
  workflowSourcePath: string;
  historyFile: string;
}): Promise<ReplayCapturedCommand[]> {
  const worker = await loadReplayWorker();
  const proto = (await import('@temporalio/proto')) as {
    temporal: {
      api: { history: { v1: { History: { fromObject(value: unknown): unknown } } } };
    };
  };
  const historyJson: unknown = await Bun.file(options.historyFile).json();

  if (!isReplayHistoryJson(historyJson)) {
    throw new Error(
      `Event History file is not a Temporal history JSON object: ${options.historyFile}`,
    );
  }

  const history = proto.temporal.api.history.v1.History.fromObject(toIsoEventTimes(historyJson));
  const captured: ReplayCapturedCommand[] = [];

  await worker.runReplayHistory(
    {
      workflowsPath: join(options.projectRoot, options.workflowSourcePath),
      interceptors: { workflowModules: [interceptorsPath] },
      sinks: {
        replayCapture: {
          commandCaptured: {
            callDuringReplay: true,
            fn: (_workflowInfo, kind, name, sequence) => {
              captured.push({
                kind: kind === 'timer' ? 'timer' : 'activity',
                name: String(name),
                sequence: Number(sequence),
              });
            },
          },
        },
      },
    },
    history,
  );

  return captured;
}
