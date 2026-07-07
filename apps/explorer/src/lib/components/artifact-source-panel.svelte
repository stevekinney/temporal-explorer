<script lang="ts">
  import {
    BookOpen,
    CheckCircle2,
    FileJson,
    FolderOpen,
    History,
    Upload,
    XCircle,
  } from 'lucide-svelte';

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
    onShowUpload,
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
    onShowUpload: () => void;
    onAnalyzeFiles: (files: FileList | null) => void;
    onAnalyzeHistory: (files: FileList | null) => void;
    onClearHistory: () => void;
  } = $props();
</script>

<aside class="source-panel" aria-label="Artifact sources">
  <section class="brand">
    <div class="brand-mark" aria-hidden="true">TE</div>
    <div>
      <h1>Temporal Explorer</h1>
      <p>Static workflow graphs, with runtime history when you have it.</p>
    </div>
  </section>

  <div class="mode-switch" role="tablist" aria-label="Explorer source">
    <button
      type="button"
      role="tab"
      aria-selected={sourceMode === 'examples'}
      class:active={sourceMode === 'examples'}
      onclick={() => onSelectExample(selectedExampleId || examples[0]?.id || '')}
    >
      <BookOpen size={16} aria-hidden="true" />
      Examples
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={sourceMode === 'upload'}
      class:active={sourceMode === 'upload'}
      onclick={onShowUpload}
    >
      <Upload size={16} aria-hidden="true" />
      Upload
    </button>
  </div>

  {#if examples.length > 0}
    <section class="examples-section" aria-labelledby="examples-heading">
      <div class="section-heading">
        <h2 id="examples-heading">Example workflows</h2>
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
      <h2 id="upload-heading">Local project</h2>
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
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 1rem;
    padding: 1rem;
    border-right: 1px solid #c8d6dc;
    background: rgba(248, 251, 252, 0.92);
    backdrop-filter: blur(16px);
    overflow: hidden;
  }

  .brand {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    align-items: center;
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.375rem;
    background: #18242b;
    color: #f8fbfc;
    font-weight: 760;
  }

  h1,
  h2,
  p {
    margin: 0;
    letter-spacing: 0;
  }

  h1 {
    font-size: 1.45rem;
    line-height: 1.05;
  }

  h2 {
    font-size: 0.82rem;
    line-height: 1;
    text-transform: uppercase;
  }

  .brand p,
  .upload-section p,
  .example-list span {
    color: #5f6f78;
    font-size: 0.86rem;
    line-height: 1.35;
  }

  .mode-switch,
  .section-heading,
  .file-action,
  .clear-history {
    display: flex;
    align-items: center;
  }

  .mode-switch {
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid #c8d6dc;
    border-radius: 0.5rem;
    background: #e7eef2;
  }

  .mode-switch button {
    min-height: 2.25rem;
    flex: 1;
    justify-content: center;
    gap: 0.45rem;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: #40515b;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .mode-switch button.active {
    background: #ffffff;
    color: #172026;
    box-shadow: 0 1px 2px rgba(22, 32, 38, 0.08);
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
    padding: 0.7rem 0.75rem;
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
    font-size: 0.92rem;
    line-height: 1.15;
  }

  .upload-section {
    padding: 0.85rem;
    border: 1px solid #c8d6dc;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  .file-action,
  .clear-history {
    min-height: 2.5rem;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    border: 1px solid #c8d6dc;
    border-radius: 0.5rem;
    background: #f5f8fa;
    color: #172026;
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
