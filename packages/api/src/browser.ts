import {
  analyzeProject,
  InMemoryFileSource,
  loadTemporalExplorerProject,
  type FileSource,
} from '@temporal-explorer/analyzer';
import { parseEventHistory } from '@temporal-explorer/history/browser';
import { createExecutionOverlay } from '@temporal-explorer/mapper';
import {
  explorerBundleSchema,
  type Diagnostic,
  type ExplorerArtifacts,
  type RuntimeTraceDocument,
} from '@temporal-explorer/schemas';

import { createTemporalExplorerResult, type TemporalExplorerResult } from './result';

export type BrowserFileEntry = {
  path: string;
  contents: string;
};

export type CreateExplorerBundleOptions = {
  files?: readonly BrowserFileEntry[];
  fileSource?: FileSource;
  root?: string;
  history?: unknown;
  workflowName?: string;
  projectName?: string;
};

function getWorkflowName(
  bundleWorkflowName: string | undefined,
  trace: RuntimeTraceDocument,
): string {
  return bundleWorkflowName ?? trace.execution.workflowType;
}

/** Creates the Explorer UI bundle from browser-provided files and optional history JSON. */
export async function createExplorerBundle(
  options: CreateExplorerBundleOptions = {},
): Promise<TemporalExplorerResult<ExplorerArtifacts>> {
  const root = options.root ?? options.fileSource?.root ?? '/project';
  const fileSource =
    options.fileSource ??
    new InMemoryFileSource(
      (options.files ?? []).map((file) => [file.path, file.contents] as const),
      root,
    );
  const project = await loadTemporalExplorerProject({ root, fileSource });
  const analysis = await analyzeProject(project);
  let traces: RuntimeTraceDocument[] = [];
  let overlays: ExplorerArtifacts['overlays'] = [];

  if (options.history !== undefined) {
    const trace = parseEventHistory({
      history: options.history,
      importedFrom: 'file',
      projectRoot: options.projectName ?? 'uploaded-project',
    });
    traces = [trace];
    overlays = [
      createExecutionOverlay({
        analysis,
        trace,
        workflowName: getWorkflowName(options.workflowName, trace),
      }),
    ];
  }

  const diagnostics: Diagnostic[] = [
    ...analysis.diagnostics,
    ...traces.flatMap((trace) => trace.diagnostics),
    ...overlays.flatMap((overlay) => overlay.diagnostics),
  ];

  const bundle = explorerBundleSchema.parse({
    projectName: options.projectName ?? 'Uploaded Project',
    artifactDirectory: 'in-browser',
    analysis,
    traces,
    overlays,
  });

  return createTemporalExplorerResult(bundle, {
    diagnostics,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
    metadata: analysis.metadata,
  });
}

export { InMemoryFileSource };
export type { ExplorerArtifacts, FileSource };
