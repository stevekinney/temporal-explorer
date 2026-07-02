/**
 * Workflow-context interceptors for the Stage 13 replay spike.
 *
 * Captures every scheduled Activity and started timer during replay, with the
 * workflow-VM stack trace at the call site, and reports them through the
 * `replaySpike` sink so the spike script can evaluate whether replay-derived
 * evidence can disambiguate repeated and dynamic commands.
 */
import { proxySinks, type Sinks, type WorkflowInterceptorsFactory } from '@temporalio/workflow';

export interface ReplaySpikeSinks extends Sinks {
  replaySpike: {
    commandCaptured(kind: string, name: string, sequence: number, stack: string): void;
  };
}

const { replaySpike } = proxySinks<ReplaySpikeSinks>();

let sequence = 0;

function captureStack(): string {
  return new Error('replay-spike-stack').stack ?? 'no-stack';
}

export const interceptors: WorkflowInterceptorsFactory = () => ({
  outbound: [
    {
      async scheduleActivity(input, next) {
        sequence += 1;
        replaySpike.commandCaptured('activity', input.activityType, sequence, captureStack());
        return await next(input);
      },
      async startTimer(input, next) {
        sequence += 1;
        replaySpike.commandCaptured('timer', `${input.durationMs}ms`, sequence, captureStack());
        return await next(input);
      },
    },
  ],
});
