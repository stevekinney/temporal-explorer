<script lang="ts">
  import ArtifactExplorer from '$lib/components/artifact-explorer.svelte';
  import ArtifactSourcePanel from '$lib/components/artifact-source-panel.svelte';
  import { Upload } from 'lucide-svelte';

  import type { ExplorerArtifacts } from '@temporal-explorer/schemas';

  import type { PageProps } from './$types';

  type SourceMode = 'examples' | 'upload' | 'local';
  type AnalysisWorkerRequest =
    | {
        type: 'analyze';
        files: { path: string; contents: string }[];
        projectName: string;
      }
    | {
        type: 'analyzeWithHistory';
        files: { path: string; contents: string }[];
        history: unknown;
        workflowName?: string | undefined;
        projectName: string;
      };

  type AnalysisWorkerResponse =
    { type: 'success'; artifacts: ExplorerArtifacts } | { type: 'error'; message: string };

  let { data }: PageProps = $props();
  let artifacts = $state.raw<ExplorerArtifacts | undefined>();
  let loadedExampleArtifacts = $state.raw<ExplorerArtifacts | undefined>();
  let fileEntries = $state.raw<{ path: string; contents: string }[]>([]);
  let projectName = $state('Uploaded project');
  let sourceMode = $state<SourceMode>('examples');
  let selectedExampleId = $state('');
  let loadedExampleId = $state('');
  let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let exampleStatus = $state<'idle' | 'loading' | 'error'>('idle');
  let errorMessage = $state('');
  let exampleErrorMessage = $state('');
  let analysisRequestId = 0;
  let exampleRequestId = 0;

  const ignoredUploadSegments = new Set([
    '.git',
    '.svelte-kit',
    '.temporal-explorer',
    '.turbo',
    'build',
    'coverage',
    'dist',
    'node_modules',
  ]);
  const selectedExample = $derived(
    data.examples.find((example) => example.id === selectedExampleId) ?? data.examples[0],
  );
  const defaultExampleId = $derived(data.examples[0]?.id ?? '');
  const selectedExampleArtifacts = $derived.by(() => {
    if (!selectedExample) {
      return undefined;
    }

    if (selectedExample.id === loadedExampleId) {
      return loadedExampleArtifacts;
    }

    if (selectedExample.id === defaultExampleId) {
      return data.exampleArtifacts;
    }

    return undefined;
  });
  const isWebWorkbench = $derived(data.examples.length > 0);
  const canImportHistory = $derived(
    sourceMode === 'upload' && status !== 'loading' && fileEntries.length > 0 && Boolean(artifacts),
  );
  const canViewUploadedArtifacts = $derived(sourceMode !== 'upload' && Boolean(artifacts));
  const uploadStatusText = $derived.by(() => {
    if (status === 'loading') return 'Analyzing uploaded files in your browser...';
    if (status === 'ready') return `${projectName} is loaded.`;
    if (status === 'error') return errorMessage;
    return 'Pick a TypeScript project directory. Event History is optional after that.';
  });

  function createWorker(): Worker {
    return new Worker(new URL('$lib/analysis.worker.ts', import.meta.url), {
      type: 'module',
    });
  }

  function postToWorker(request: AnalysisWorkerRequest): Promise<ExplorerArtifacts> {
    return new Promise((resolve, reject) => {
      const worker = createWorker();

      worker.addEventListener(
        'message',
        (event: MessageEvent<AnalysisWorkerResponse>) => {
          worker.terminate();

          if (event.data.type === 'success') {
            resolve(event.data.artifacts);
          } else {
            reject(new Error(event.data.message));
          }
        },
        { once: true },
      );
      worker.addEventListener(
        'error',
        (event) => {
          worker.terminate();
          reject(new Error(event.message));
        },
        { once: true },
      );
      worker.postMessage(request, { transfer: [] });
    });
  }

  function getRelativePath(file: File): string {
    return file.webkitRelativePath || file.name;
  }

  function shouldReadFile(file: File): boolean {
    return (
      /\.(ts|tsx|json)$/u.test(file.name) &&
      !getRelativePath(file)
        .split('/')
        .some((segment) => ignoredUploadSegments.has(segment))
    );
  }

  function getProjectName(files: FileList): string {
    const firstPath = files[0] ? getRelativePath(files[0]) : '';
    return firstPath.split('/')[0] || 'Uploaded project';
  }

  function getProjectRelativePath(file: File, selectedProjectName: string): string {
    const relativePath = getRelativePath(file);
    const projectPrefix = `${selectedProjectName}/`;

    return relativePath.startsWith(projectPrefix)
      ? relativePath.slice(projectPrefix.length)
      : relativePath;
  }

  async function readFileEntries(files: FileList): Promise<{ path: string; contents: string }[]> {
    const entries: { path: string; contents: string }[] = [];
    const selectedProjectName = getProjectName(files);

    for (const file of files) {
      if (shouldReadFile(file)) {
        entries.push({
          path: `/project/${getProjectRelativePath(file, selectedProjectName)}`,
          contents: await file.text(),
        });
      }
    }

    return entries;
  }

  function selectExample(exampleId: string): void {
    selectedExampleId = exampleId;
    sourceMode = 'examples';
    void loadExampleArtifacts(exampleId);
  }

  function viewUploadedArtifacts(): void {
    if (artifacts) {
      sourceMode = 'upload';
    }
  }

  function hasExampleArtifacts(exampleId: string): boolean {
    return Boolean(
      (loadedExampleId === exampleId && loadedExampleArtifacts) ||
      (exampleId === defaultExampleId && data.exampleArtifacts),
    );
  }

  function isCurrentExampleRequest(requestId: number): boolean {
    return requestId === exampleRequestId;
  }

  function recordExampleLoadError(requestId: number, error: unknown): void {
    if (!isCurrentExampleRequest(requestId)) {
      return;
    }

    exampleStatus = 'error';
    exampleErrorMessage = error instanceof Error ? error.message : String(error);
  }

  async function loadExampleArtifacts(exampleId: string): Promise<void> {
    if (!exampleId) {
      exampleRequestId += 1;
      exampleStatus = 'idle';
      exampleErrorMessage = '';
      return;
    }

    if (hasExampleArtifacts(exampleId)) {
      exampleRequestId += 1;
      exampleStatus = 'idle';
      exampleErrorMessage = '';
      return;
    }

    exampleStatus = 'loading';
    exampleErrorMessage = '';
    const requestId = (exampleRequestId += 1);

    try {
      const response = await fetch(`/examples/${encodeURIComponent(exampleId)}.json`);

      if (!response.ok) {
        throw new Error(`Example ${exampleId} failed to load (${response.status}).`);
      }

      const nextArtifacts = (await response.json()) as ExplorerArtifacts;

      if (!isCurrentExampleRequest(requestId)) {
        return;
      }

      loadedExampleArtifacts = nextArtifacts;
      loadedExampleId = exampleId;
      exampleStatus = 'idle';
    } catch (error) {
      recordExampleLoadError(requestId, error);
    }
  }

  async function analyzeFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) {
      return;
    }

    status = 'loading';
    errorMessage = '';
    sourceMode = 'upload';
    const selectedProjectName = getProjectName(files);
    projectName = selectedProjectName;
    const requestId = (analysisRequestId += 1);

    try {
      const nextFileEntries = await readFileEntries(files);
      const nextArtifacts = await postToWorker({
        type: 'analyze',
        files: nextFileEntries,
        projectName: selectedProjectName,
      });

      if (requestId !== analysisRequestId) {
        return;
      }

      fileEntries = nextFileEntries;
      artifacts = nextArtifacts;
      status = 'ready';
    } catch (error) {
      if (requestId !== analysisRequestId) {
        return;
      }

      artifacts = undefined;
      status = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function analyzeHistory(files: FileList | null): Promise<void> {
    const [file] = files ? [...files] : [];

    if (!file || fileEntries.length === 0) {
      return;
    }

    status = 'loading';
    errorMessage = '';
    sourceMode = 'upload';
    const selectedProjectName = projectName;
    const requestId = (analysisRequestId += 1);

    try {
      const nextArtifacts = await postToWorker({
        type: 'analyzeWithHistory',
        files: fileEntries,
        history: JSON.parse(await file.text()) as unknown,
        projectName: selectedProjectName,
      });

      if (requestId !== analysisRequestId) {
        return;
      }

      artifacts = nextArtifacts;
      status = 'ready';
    } catch (error) {
      if (requestId !== analysisRequestId) {
        return;
      }

      status = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  function clearHistory(): void {
    if (!artifacts) {
      return;
    }

    analysisRequestId += 1;
    artifacts = {
      ...artifacts,
      traces: [],
      overlays: [],
    };
  }
</script>

{#if isWebWorkbench}
  <main class="workbench">
    <ArtifactSourcePanel
      examples={data.examples}
      selectedExampleId={selectedExample?.id ?? selectedExampleId}
      {sourceMode}
      {status}
      {uploadStatusText}
      {canImportHistory}
      {canViewUploadedArtifacts}
      hasImportedHistory={Boolean(artifacts && artifacts.traces.length > 0)}
      onSelectExample={selectExample}
      onViewUploadedArtifacts={viewUploadedArtifacts}
      onAnalyzeFiles={analyzeFiles}
      onAnalyzeHistory={analyzeHistory}
      onClearHistory={clearHistory}
    />

    <section class="viewer" aria-label="Workflow explorer">
      {#if sourceMode === 'upload' && artifacts}
        <ArtifactExplorer
          {artifacts}
          embedded
          requestedTrace={data.requestedTrace}
          siteUrl={data.siteUrl}
        />
      {:else if sourceMode === 'examples' && selectedExampleArtifacts}
        <ArtifactExplorer
          artifacts={selectedExampleArtifacts}
          embedded
          requestedTrace={data.requestedTrace}
          siteUrl={data.siteUrl}
        />
      {:else if sourceMode === 'examples' && exampleStatus === 'loading'}
        <section class="empty-view">
          <Upload size={32} aria-hidden="true" />
          <h2>Loading example workflow</h2>
          <p>The selected example graph is loading.</p>
        </section>
      {:else if sourceMode === 'examples' && exampleStatus === 'error'}
        <section class="empty-view">
          <Upload size={32} aria-hidden="true" />
          <h2>Example failed to load</h2>
          <p>{exampleErrorMessage}</p>
        </section>
      {:else}
        <section class="empty-view">
          <Upload size={32} aria-hidden="true" />
          <h2>Choose an example or upload a project</h2>
          <p>The graph renders as soon as Temporal Explorer has workflow definitions.</p>
        </section>
      {/if}
    </section>
  </main>
{:else if data.artifacts}
  <ArtifactExplorer
    artifacts={data.artifacts}
    requestedTrace={data.requestedTrace}
    siteUrl={data.siteUrl}
  />
{:else}
  <main class="workbench empty-workbench">
    <ArtifactSourcePanel
      examples={data.examples}
      selectedExampleId={selectedExample?.id ?? selectedExampleId}
      {sourceMode}
      {status}
      {uploadStatusText}
      {canImportHistory}
      {canViewUploadedArtifacts}
      hasImportedHistory={Boolean(artifacts && artifacts.traces.length > 0)}
      onSelectExample={selectExample}
      onViewUploadedArtifacts={viewUploadedArtifacts}
      onAnalyzeFiles={analyzeFiles}
      onAnalyzeHistory={analyzeHistory}
      onClearHistory={clearHistory}
    />
    <section class="viewer" aria-label="Workflow explorer">
      <section class="empty-view">
        <Upload size={32} aria-hidden="true" />
        <h2>Choose an example or upload a project</h2>
        <p>The graph renders as soon as Temporal Explorer has workflow definitions.</p>
      </section>
    </section>
  </main>
{/if}

<style>
  :global(body) {
    margin: 0;
    background:
      linear-gradient(90deg, rgba(31, 73, 92, 0.08) 1px, transparent 1px) 0 0 / 48px 48px,
      linear-gradient(180deg, rgba(31, 73, 92, 0.06) 1px, transparent 1px) 0 0 / 48px 48px,
      #edf3f5;
  }

  .workbench {
    min-height: 100vh;
    display: grid;
    grid-template-columns: minmax(14rem, 16.5rem) minmax(0, 1fr);
    color: #172026;
  }

  p {
    margin: 0;
    letter-spacing: 0;
  }

  .viewer {
    min-width: 0;
    min-height: 100vh;
    overflow: hidden;
    background: #f8fbfc;
  }

  .viewer :global(.explorer-shell) {
    min-height: 100vh;
  }

  .empty-view {
    min-height: calc(100vh - 2rem);
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.75rem;
    border: 1px dashed #a8bbc4;
    border-radius: 0.75rem;
    background: rgba(248, 251, 252, 0.74);
    text-align: center;
  }

  .empty-view h2 {
    color: #172026;
    font-size: 1.4rem;
    text-transform: none;
  }

  @media (max-width: 960px) {
    .workbench {
      grid-template-columns: 1fr;
    }
  }
</style>
