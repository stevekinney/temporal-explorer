<script lang="ts">
  import ArtifactExplorer from '$lib/components/artifact-explorer.svelte';
  import { EmptyState } from '$cinder-components/empty-state';
  import { Upload } from 'lucide-svelte';

  import type { ExplorerArtifacts } from '@temporal-explorer/schemas';

  import type { PageProps } from './$types';

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
  let fileEntries = $state.raw<{ path: string; contents: string }[]>([]);
  let projectName = $state('Uploaded Project');
  let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let errorMessage = $state('');
  let analysisRequestId = 0;

  const displayArtifacts = $derived(artifacts ?? data.artifacts);
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

  function createWorker(): Worker {
    return new Worker(new URL('$lib/analysis.worker.ts', import.meta.url), {
      type: 'module',
    });
  }

  function postToWorker(request: AnalysisWorkerRequest): Promise<ExplorerArtifacts> {
    return new Promise((resolve, reject) => {
      const worker = createWorker();

      worker.onmessage = (event: MessageEvent<AnalysisWorkerResponse>) => {
        worker.terminate();

        if (event.data.type === 'success') {
          resolve(event.data.artifacts);
        } else {
          reject(new Error(event.data.message));
        }
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.postMessage(request);
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

  function getProjectName(files: FileList): string {
    const firstPath = files[0] ? getRelativePath(files[0]) : '';
    return firstPath.split('/')[0] || 'Uploaded Project';
  }

  async function analyzeFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) {
      return;
    }

    status = 'loading';
    errorMessage = '';
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

{#if displayArtifacts}
  <ArtifactExplorer
    artifacts={displayArtifacts}
    requestedTrace={data.requestedTrace}
    siteUrl={data.siteUrl}
  />
  {#if fileEntries.length > 0}
    <section class="history-upload" aria-label="Optional Event History overlay">
      <label>
        <span>Event History JSON</span>
        <input
          type="file"
          accept="application/json,.json"
          onchange={(event) => analyzeHistory(event.currentTarget.files)}
        />
      </label>
      {#if displayArtifacts.traces.length > 0}
        <button type="button" onclick={clearHistory}>Remove history</button>
      {/if}
      {#if status === 'loading'}
        <p class="status">Loading history...</p>
      {:else if status === 'error'}
        <EmptyState title="History import failed" description={errorMessage} headingLevel={2} />
      {/if}
    </section>
  {/if}
{:else}
  <main class="upload-shell">
    <section
      class="upload-panel"
      role="group"
      ondragover={(event) => event.preventDefault()}
      ondrop={(event) => {
        event.preventDefault();
        analyzeFiles(event.dataTransfer?.files ?? null);
      }}
    >
      <Upload size={36} aria-hidden="true" />
      <h1>Temporal Explorer</h1>
      <p>Select a local TypeScript project directory to render its static Workflow graph.</p>
      <label class="directory-picker">
        <span>Choose directory</span>
        <input
          type="file"
          webkitdirectory
          multiple
          onchange={(event) => analyzeFiles(event.currentTarget.files)}
        />
      </label>
      {#if status === 'loading'}
        <p class="status">Loading analyzer...</p>
      {:else if status === 'error'}
        <EmptyState title="Analysis failed" description={errorMessage} headingLevel={2} />
      {/if}
    </section>
  </main>
{/if}

<style>
  .upload-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: #f5f7f9;
  }

  .upload-panel {
    width: min(100%, 40rem);
    display: grid;
    gap: 1rem;
    justify-items: center;
    text-align: center;
    padding: 2rem;
    border: 1px dashed #9aa8b5;
    border-radius: 8px;
    background: #ffffff;
  }

  .upload-panel h1 {
    margin: 0;
    font-size: 2rem;
    letter-spacing: 0;
  }

  .upload-panel p {
    margin: 0;
    color: #526170;
  }

  .directory-picker,
  .history-upload label,
  .history-upload button {
    min-height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 1rem;
    border: 1px solid #1f2933;
    border-radius: 6px;
    background: #1f2933;
    color: #ffffff;
    font-weight: 600;
    cursor: pointer;
  }

  .directory-picker input,
  .history-upload input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .status {
    font-weight: 600;
  }

  .history-upload {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 20;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .history-upload label,
  .history-upload button {
    background: #ffffff;
    color: #1f2933;
  }

  @media (max-width: 700px) {
    .history-upload {
      left: 1rem;
      flex-wrap: wrap;
    }
  }
</style>
