<script lang="ts">
  import ArtifactExplorer from '$lib/components/artifact-explorer.svelte';
  import ArtifactSourcePanel from '$lib/components/artifact-source-panel.svelte';
  import { defaultWorkflowId as selectDefaultWorkflowId } from '$lib/components/artifact-selection';
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
  let sourcePanelOpen = $state(true);
  let selectedLocalWorkflowId = $state<string | undefined>();
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
  const localSources = $derived.by(() => {
    const localArtifacts = data.artifacts;
    if (!localArtifacts) return [];

    return localArtifacts.analysis.workflows.map((workflow) => ({
      id: workflow.id,
      title: workflow.name,
      description: `${workflow.temporalCommands.length} commands, ${localArtifacts.traces.length} trace${localArtifacts.traces.length === 1 ? '' : 's'}`,
    }));
  });
  const defaultLocalWorkflowId = $derived(
    data.artifacts ? selectDefaultWorkflowId(data.artifacts, data.requestedTrace) : undefined,
  );
  const selectedLocalSourceId = $derived(selectedLocalWorkflowId ?? defaultLocalWorkflowId);
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

  $effect(() => {
    if (sourceMode === 'examples' && data.artifacts && data.examples.length === 0) {
      sourceMode = 'local';
    }
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

  function selectLocalSource(sourceId: string): void {
    selectedLocalWorkflowId = sourceId;
    sourceMode = 'local';
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
    artifacts = undefined;
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
  <main class="workbench" class:source-panel-collapsed={!sourcePanelOpen}>
    <ArtifactSourcePanel
      examples={data.examples}
      {localSources}
      bind:open={sourcePanelOpen}
      selectedExampleId={selectedExample?.id ?? selectedExampleId}
      {selectedLocalSourceId}
      {sourceMode}
      {status}
      {uploadStatusText}
      {canImportHistory}
      {canViewUploadedArtifacts}
      hasImportedHistory={Boolean(artifacts && artifacts.traces.length > 0)}
      onSelectExample={selectExample}
      onSelectLocalSource={selectLocalSource}
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
  <main class="workbench" class:source-panel-collapsed={!sourcePanelOpen}>
    <ArtifactSourcePanel
      examples={data.examples}
      {localSources}
      bind:open={sourcePanelOpen}
      selectedExampleId={selectedExample?.id ?? selectedExampleId}
      {selectedLocalSourceId}
      {sourceMode}
      {status}
      {uploadStatusText}
      {canImportHistory}
      {canViewUploadedArtifacts}
      hasImportedHistory={Boolean(artifacts && artifacts.traces.length > 0)}
      onSelectExample={selectExample}
      onSelectLocalSource={selectLocalSource}
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
      {:else}
        <ArtifactExplorer
          artifacts={data.artifacts}
          embedded
          requestedTrace={data.requestedTrace}
          bind:selectedWorkflowId={selectedLocalWorkflowId}
          siteUrl={data.siteUrl}
        />
      {/if}
    </section>
  </main>
{:else}
  <main class="workbench empty-workbench" class:source-panel-collapsed={!sourcePanelOpen}>
    <ArtifactSourcePanel
      examples={data.examples}
      {localSources}
      bind:open={sourcePanelOpen}
      selectedExampleId={selectedExample?.id ?? selectedExampleId}
      {selectedLocalSourceId}
      {sourceMode}
      {status}
      {uploadStatusText}
      {canImportHistory}
      {canViewUploadedArtifacts}
      hasImportedHistory={Boolean(artifacts && artifacts.traces.length > 0)}
      onSelectExample={selectExample}
      onSelectLocalSource={selectLocalSource}
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
      linear-gradient(90deg, rgba(15, 143, 131, 0.08) 1px, transparent 1px) 0 0 / 56px 56px,
      linear-gradient(180deg, rgba(52, 104, 246, 0.05) 1px, transparent 1px) 0 0 / 56px 56px,
      #e8eef0;
  }

  .workbench {
    min-height: 100vh;
    display: grid;
    grid-template-columns: minmax(15rem, 17rem) minmax(0, 1fr);
    color: #152027;
  }

  .workbench.source-panel-collapsed {
    grid-template-columns: 3.25rem minmax(0, 1fr);
  }

  p {
    margin: 0;
    letter-spacing: 0;
  }

  .viewer {
    min-width: 0;
    min-height: 100vh;
    overflow: hidden;
    background:
      linear-gradient(90deg, rgba(21, 32, 39, 0.04) 1px, transparent 1px) 0 0 / 3.5rem 3.5rem,
      linear-gradient(180deg, rgba(21, 32, 39, 0.035) 1px, transparent 1px) 0 0 / 3.5rem 3.5rem,
      #f4f7f7;
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
    margin: 1rem;
    border: 1px dashed #9fb3bb;
    border-radius: 0.5rem;
    background: rgba(246, 248, 248, 0.78);
    text-align: center;
  }

  .empty-view h2 {
    color: #152027;
    font-size: 1.4rem;
    text-transform: none;
  }

  @media (max-width: 960px) {
    .workbench {
      grid-template-columns: 1fr;
    }

    .workbench.source-panel-collapsed {
      grid-template-columns: 1fr;
    }
  }
</style>
