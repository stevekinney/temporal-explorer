/**
 * Stage 13 replay spike: can replaying a fixture history with instrumented
 * workflow interceptors give the mapper source-level evidence that static
 * analysis plus Event History alone cannot?
 *
 * Cases exercised, per the product plan:
 * - dynamic Activity dispatch (fixtures/dynamic, repeated dynamic calls)
 * - repeated Activity types plus branch divergence (fixtures/timer-race)
 * - identical timers via condition timeouts (fixtures/timer-race)
 * - patch markers (fixtures/patched)
 */
import { temporal } from '@temporalio/proto';
import { Worker } from '@temporalio/worker';

type CapturedCommand = {
  fixture: string;
  history: string;
  kind: string;
  name: string;
  sequence: number;
  sourceFrame: string;
};

const fixturesRoot = new URL('../../fixtures/', import.meta.url);
const interceptorsPath = new URL('spike-interceptors.ts', import.meta.url).pathname;

const replayCases = [
  {
    fixture: 'dynamic',
    history: 'planned',
    workflowsPath: 'src/workflows/dynamic-workflow.ts',
  },
  {
    fixture: 'timer-race',
    history: 'signal-wins',
    workflowsPath: 'src/workflows/timer-race-workflow.ts',
  },
  {
    fixture: 'timer-race',
    history: 'timeout',
    workflowsPath: 'src/workflows/timer-race-workflow.ts',
  },
  {
    fixture: 'patched',
    history: 'patched-run',
    workflowsPath: 'src/workflows/patched-workflow.ts',
  },
];

function extractSourceFrame(stack: string): string {
  const lines = stack.split('\n').slice(1);
  const workflowFrame = lines.find(
    (line) => line.includes('/workflows/') && !line.includes('spike-interceptors'),
  );
  return (workflowFrame ?? lines[0] ?? 'unknown').trim();
}

async function replayCapture(replayCase: (typeof replayCases)[number]): Promise<CapturedCommand[]> {
  const fixtureRoot = new URL(`${replayCase.fixture}/`, fixturesRoot);
  const historyJson = (await Bun.file(
    new URL(`histories/${replayCase.history}.json`, fixtureRoot),
  ).json()) as { events: Record<string, unknown>[] };

  // Fixture histories store numeric proto enums and ISO event times; build a
  // real History object instead of relying on the tctl-style JSON conversion
  // inside the SDK, converting ISO strings back into proto Timestamps.
  for (const event of historyJson.events) {
    if (typeof event['eventTime'] === 'string') {
      const milliseconds = Date.parse(event['eventTime']);
      event['eventTime'] = {
        seconds: Math.floor(milliseconds / 1000),
        nanos: (milliseconds % 1000) * 1_000_000,
      };
    }
  }

  const history = temporal.api.history.v1.History.fromObject(historyJson);
  const captured: CapturedCommand[] = [];

  await Worker.runReplayHistory(
    {
      workflowsPath: new URL(replayCase.workflowsPath, fixtureRoot).pathname,
      interceptors: {
        workflowModules: [interceptorsPath],
      },
      sinks: {
        replaySpike: {
          commandCaptured: {
            callDuringReplay: true,
            fn: (_workflowInfo, kind, name, sequence, stack) => {
              captured.push({
                fixture: replayCase.fixture,
                history: replayCase.history,
                kind: String(kind),
                name: String(name),
                sequence: Number(sequence),
                sourceFrame: extractSourceFrame(String(stack)),
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

for (const replayCase of replayCases) {
  const captured = await replayCapture(replayCase);
  console.log(`\n=== ${replayCase.fixture}/${replayCase.history} ===`);

  for (const command of captured) {
    console.log(`${command.sequence}. ${command.kind} ${command.name}\n   ${command.sourceFrame}`);
  }

  if (captured.length === 0) {
    console.log('No commands captured.');
  }
}
