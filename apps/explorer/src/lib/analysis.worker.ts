import { createExplorerBundle, type BrowserFileEntry } from '@temporal-explorer/api/browser';
import type { ExplorerArtifacts } from '@temporal-explorer/schemas';

type AnalysisWorkerRequest =
  | {
      type: 'analyze';
      files: BrowserFileEntry[];
      projectName: string;
    }
  | {
      type: 'analyzeWithHistory';
      files: BrowserFileEntry[];
      history: unknown;
      workflowName?: string | undefined;
      projectName: string;
    };

type AnalysisWorkerResponse =
  { type: 'success'; artifacts: ExplorerArtifacts } | { type: 'error'; message: string };

function send(message: AnalysisWorkerResponse): void {
  postMessage(message);
}

self.onmessage = async (event: MessageEvent<AnalysisWorkerRequest>) => {
  try {
    const result = await createExplorerBundle({
      root: '/project',
      files: event.data.files,
      projectName: event.data.projectName,
      ...(event.data.type === 'analyzeWithHistory'
        ? {
            history: event.data.history,
            workflowName: event.data.workflowName,
          }
        : {}),
    });
    send({ type: 'success', artifacts: result.value });
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
