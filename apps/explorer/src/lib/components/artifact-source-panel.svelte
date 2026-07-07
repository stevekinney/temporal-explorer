<script lang="ts">
  import { CheckCircle2, FileJson, FolderOpen, History, XCircle } from 'lucide-svelte';

  type SourceMode = 'examples' | 'upload' | 'local';
  type ExampleSummary = {
    id: string;
    title: string;
    description: string;
  };

  let {
    examples,
    selectedExampleId,
    sourceMode,
    status,
    uploadStatusText,
    canImportHistory,
    hasImportedHistory,
    onSelectExample,
    onAnalyzeFiles,
    onAnalyzeHistory,
    onClearHistory,
  }: {
    examples: ExampleSummary[];
    selectedExampleId: string;
    sourceMode: SourceMode;
    status: 'idle' | 'loading' | 'ready' | 'error';
    uploadStatusText: string;
    canImportHistory: boolean;
    hasImportedHistory: boolean;
    onSelectExample: (exampleId: string) => void;
    onAnalyzeFiles: (files: FileList | null) => void;
    onAnalyzeHistory: (files: FileList | null) => void;
    onClearHistory: () => void;
  } = $props();
</script>

<aside class="source-panel" aria-label="Artifact sources">
  <section class="brand">
    <div>
      <p>Temporal Explorer</p>
      <h1>Examples</h1>
    </div>
  </section>

  {#if examples.length > 0}
    <section class="examples-section" aria-labelledby="examples-heading">
      <div class="section-heading">
        <h2 id="examples-heading">Workflows</h2>
        <span>{examples.length}</span>
      </div>
      <div class="example-list">
        {#each examples as example (example.id)}
          <button
            type="button"
            class:active={sourceMode === 'examples' && selectedExampleId === example.id}
            onclick={() => onSelectExample(example.id)}
          >
            <strong>{example.title}</strong>
            <span>{example.description}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <section
    class="upload-section"
    aria-labelledby="upload-heading"
    ondragover={(event) => event.preventDefault()}
    ondrop={(event) => {
      event.preventDefault();
      onAnalyzeFiles(event.dataTransfer?.files ?? null);
    }}
  >
    <div class="section-heading">
      <h2 id="upload-heading">Upload</h2>
      {#if status === 'ready'}
        <CheckCircle2 size={16} aria-label="Loaded" />
      {:else if status === 'error'}
        <XCircle size={16} aria-label="Error" />
      {/if}
    </div>

    <label class="file-action primary">
      <FolderOpen size={16} aria-hidden="true" />
      <span>Choose workflow directory</span>
      <input
        type="file"
        webkitdirectory
        multiple
        onchange={(event) => onAnalyzeFiles(event.currentTarget.files)}
      />
    </label>

    <label class="file-action" class:disabled={!canImportHistory}>
      <FileJson size={16} aria-hidden="true" />
      <span>Import Event History JSON</span>
      <input
        type="file"
        accept="application/json,.json"
        disabled={!canImportHistory}
        onchange={(event) => onAnalyzeHistory(event.currentTarget.files)}
      />
    </label>

    {#if hasImportedHistory}
      <button class="clear-history" type="button" onclick={onClearHistory}>
        <History size={16} aria-hidden="true" />
        Remove history
      </button>
    {/if}

    <p class:error={status === 'error'}>{uploadStatusText}</p>
  </section>
</aside>

<style>
  .source-panel {
    height: 100vh;
    min-height: 0;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0.75rem;
    padding: 0.75rem;
    border-right: 1px solid #c8d6dc;
    background: rgba(248, 251, 252, 0.92);
    backdrop-filter: blur(16px);
    overflow: hidden;
  }

  .brand {
    display: grid;
    gap: 0.15rem;
  }

  h1,
  h2,
  p {
    margin: 0;
    letter-spacing: 0;
  }

  h1 {
    font-size: 1.35rem;
    line-height: 1.05;
  }

  h2 {
    font-size: 0.82rem;
    line-height: 1;
    text-transform: uppercase;
  }

  .brand p {
    color: #5f6f78;
    font-size: 0.72rem;
    font-weight: 750;
    line-height: 1;
    text-transform: uppercase;
  }

  .upload-section p,
  .example-list span {
    color: #5f6f78;
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .section-heading,
  .file-action,
  .clear-history {
    display: flex;
    align-items: center;
  }

  .examples-section,
  .upload-section {
    min-width: 0;
    display: grid;
    gap: 0.75rem;
  }

  .examples-section {
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .section-heading {
    justify-content: space-between;
    color: #5f6f78;
  }

  .section-heading span {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .example-list {
    min-height: 0;
    display: grid;
    gap: 0.4rem;
    overflow: auto;
    padding-right: 0.25rem;
  }

  .example-list button {
    display: grid;
    gap: 0.2rem;
    padding: 0.58rem 0.65rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: transparent;
    color: #172026;
    text-align: left;
    cursor: pointer;
  }

  .example-list button:hover,
  .example-list button.active {
    border-color: #b7c9d1;
    background: #ffffff;
  }

  .example-list strong {
    font-size: 0.86rem;
    line-height: 1.15;
  }

  .upload-section {
    padding: 0.65rem;
    border: 1px solid #c8d6dc;
    border-radius: 0.5rem;
    background: #ffffff;
  }

  .file-action,
  .clear-history {
    min-height: 2.1rem;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    border: 1px solid #c8d6dc;
    border-radius: 0.4rem;
    background: #f5f8fa;
    color: #172026;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .file-action.primary {
    border-color: #172026;
    background: #172026;
    color: #ffffff;
  }

  .file-action.disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .file-action input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .clear-history {
    width: 100%;
  }

  .upload-section p.error {
    color: #9d2f25;
    font-weight: 650;
  }

  @media (max-width: 960px) {
    .source-panel {
      height: auto;
      min-height: auto;
      grid-template-rows: auto;
      border-right: 0;
      border-bottom: 1px solid #c8d6dc;
    }

    .example-list {
      max-height: 16rem;
    }
  }
</style>
