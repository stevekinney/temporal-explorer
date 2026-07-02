/**
 * Workflow-context interceptors used by the optional --replay flag. They
 * observe scheduled Activities and started timers during replay and report
 * them through the `replayCapture` sink in command order.
 */
import { proxySinks, type Sinks, type WorkflowInterceptorsFactory } from '@temporalio/workflow';

export interface ReplayCaptureSinks extends Sinks {
  replayCapture: {
    commandCaptured(kind: string, name: string, sequence: number): void;
  };
}

const { replayCapture } = proxySinks<ReplayCaptureSinks>();

let sequence = 0;

export const interceptors: WorkflowInterceptorsFactory = () => ({
  outbound: [
    {
      async scheduleActivity(input, next) {
        sequence += 1;
        replayCapture.commandCaptured('activity', input.activityType, sequence);
        return await next(input);
      },
      async startTimer(input, next) {
        sequence += 1;
        replayCapture.commandCaptured('timer', `${input.durationMs}ms`, sequence);
        return await next(input);
      },
    },
  ],
});
