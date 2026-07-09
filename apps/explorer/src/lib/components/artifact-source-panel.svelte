<script lang="ts">
  import { ActionRow } from '@lostgradient/cinder/action-row';
  import { Badge } from '@lostgradient/cinder/badge';
  import { Button } from '@lostgradient/cinder/button';
  import { SearchField } from '@lostgradient/cinder/search-field';
  import {
    CheckCircle2,
    FileJson,
    FolderOpen,
    History,
    PanelLeftClose,
    PanelLeftOpen,
    XCircle,
  } from 'lucide-svelte';

  type SourceMode = 'examples' | 'upload' | 'local';
  type ExampleSummary = {
    id: string;
    title: string;
    description: string;
  };
  type LocalSourceSummary = {
    id: string;
    title: string;
    description: string;
  };

  let {
    examples,
    localSources = [],
    selectedExampleId,
    selectedLocalSourceId,
    sourceMode,
    open = $bindable(true),
    status,
    uploadStatusText,
    canImportHistory,
    canViewUploadedArtifacts,
    hasImportedHistory,
    onSelectExample,
    onSelectLocalSource,
    onViewUploadedArtifacts,
    onAnalyzeFiles,
    onAnalyzeHistory,
    onClearHistory,
  }: {
    examples: ExampleSummary[];
    localSources?: LocalSourceSummary[];
    selectedExampleId: string;
    selectedLocalSourceId?: string | undefined;
    sourceMode: SourceMode;
    open?: boolean;
    status: 'idle' | 'loading' | 'ready' | 'error';
    uploadStatusText: string;
    canImportHistory: boolean;
    canViewUploadedArtifacts: boolean;
    hasImportedHistory: boolean;
    onSelectExample: (exampleId: string) => void;
    onSelectLocalSource: (sourceId: string) => void;
    onViewUploadedArtifacts: () => void;
    onAnalyzeFiles: (files: FileList | null) => void;
    onAnalyzeHistory: (files: FileList | null) => void;
    onClearHistory: () => void;
  } = $props();

  let searchQuery = $state('');

  const filteredExamples = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return examples;

    return examples.filter((example) =>
      `${example.title} ${example.description}`.toLowerCase().includes(query),
    );
  });
</script>

<aside
  class="source-panel"
  class:local-only={examples.length === 0}
  class:collapsed={!open}
  aria-label="Artifact sources"
>
  {#if !open}
    <Button
      variant="secondary"
      size="sm"
      iconOnly
      aria-label="Show source panel"
      title="Show source panel"
      onclick={() => (open = true)}
      class="panel-toggle collapsed-toggle"
    >
      <PanelLeftOpen size={16} aria-hidden="true" />
    </Button>
  {:else}
    <section class="panel-controls">
      <Button
        variant="secondary"
        size="sm"
        iconOnly
        aria-label="Hide source panel"
        title="Hide source panel"
        onclick={() => (open = false)}
        class="panel-toggle"
      >
        <PanelLeftClose size={16} aria-hidden="true" />
      </Button>
    </section>

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
        <span>Choose directory</span>
        <input
          type="file"
          webkitdirectory
          multiple
          onchange={(event) => onAnalyzeFiles(event.currentTarget.files)}
        />
      </label>

      <label class="file-action" class:disabled={!canImportHistory}>
        <FileJson size={16} aria-hidden="true" />
        <span>Import history JSON</span>
        <input
          type="file"
          accept="application/json,.json"
          disabled={!canImportHistory}
          onchange={(event) => onAnalyzeHistory(event.currentTarget.files)}
        />
      </label>

      {#if canViewUploadedArtifacts || hasImportedHistory}
        <div class="upload-actions">
          {#if canViewUploadedArtifacts}
            <Button variant="secondary" size="sm" fullWidth onclick={onViewUploadedArtifacts}>
              {#snippet leadingIcon()}
                <FolderOpen size={16} />
              {/snippet}
              View project
            </Button>
          {/if}

          {#if hasImportedHistory}
            <Button variant="secondary" size="sm" fullWidth onclick={onClearHistory}>
              {#snippet leadingIcon()}
                <History size={16} />
              {/snippet}
              Remove history
            </Button>
          {/if}
        </div>
      {/if}

      <p class:error={status === 'error'}>{uploadStatusText}</p>
    </section>

    {#if examples.length > 0}
      <section class="examples-section" aria-labelledby="examples-heading">
        <div class="section-heading">
          <h2 id="examples-heading">Examples</h2>
          <Badge variant="neutral" size="sm">{examples.length}</Badge>
        </div>
        <SearchField
          value={searchQuery}
          placeholder="Search examples..."
          shortcut="/"
          oninput={(value) => (searchQuery = value)}
          onclear={() => (searchQuery = '')}
        />
        <div class="example-list">
          {#each filteredExamples as example (example.id)}
            <ActionRow
              density="condensed"
              selected={sourceMode === 'examples' && selectedExampleId === example.id}
              selectedState="current"
              class="example-action"
              onclick={() => onSelectExample(example.id)}
            >
              {#snippet leading()}
                <span class="trace-dot" aria-hidden="true"></span>
              {/snippet}
              {#snippet title()}
                {example.title}
              {/snippet}
              {#snippet description()}
                {example.description}
              {/snippet}
            </ActionRow>
          {/each}
        </div>
      </section>
    {:else if localSources.length > 0}
      <section class="examples-section" aria-labelledby="project-heading">
        <div class="section-heading">
          <h2 id="project-heading">Workflows</h2>
          <Badge variant="neutral" size="sm">{localSources.length}</Badge>
        </div>
        <div class="example-list">
          {#each localSources as source (source.id)}
            <ActionRow
              density="condensed"
              selected={sourceMode === 'local' && selectedLocalSourceId === source.id}
              selectedState="current"
              class="example-action"
              onclick={() => onSelectLocalSource(source.id)}
            >
              {#snippet leading()}
                <span class="trace-dot" aria-hidden="true"></span>
              {/snippet}
              {#snippet title()}
                {source.title}
              {/snippet}
              {#snippet description()}
                {source.description}
              {/snippet}
            </ActionRow>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</aside>

<style>
  .source-panel {
    height: 100vh;
    min-height: 0;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 0.65rem;
    padding: 0.75rem;
    border-right: 1px solid #b9c8ce;
    background:
      linear-gradient(90deg, rgba(15, 143, 131, 0.07) 1px, transparent 1px) 0 0 / 2.5rem 2.5rem,
      rgba(245, 248, 249, 0.94);
    backdrop-filter: blur(18px);
    overflow: hidden;
  }

  .source-panel.collapsed {
    grid-template-rows: auto;
    justify-items: center;
    padding: 0.6rem 0.45rem;
    overflow: visible;
  }

  .panel-controls {
    display: flex;
    align-items: start;
    justify-content: flex-end;
    gap: 0.5rem;
    min-width: 0;
    padding-block: 0.05rem 0.15rem;
  }

  :global(.panel-toggle.cinder-button) {
    width: 1.95rem;
    min-width: 1.95rem;
    height: 1.95rem;
    padding-inline: 0;
  }

  :global(.collapsed-toggle.cinder-button) {
    margin-top: 0.1rem;
  }

  h2,
  p {
    margin: 0;
    letter-spacing: 0;
  }

  h2 {
    font-size: 0.82rem;
    line-height: 1;
    text-transform: uppercase;
  }

  .upload-section p,
  :global(.example-action .cinder-action-row__description) {
    color: #62727a;
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .section-heading,
  .file-action {
    display: flex;
    align-items: center;
  }

  .examples-section,
  .upload-section {
    min-width: 0;
    display: grid;
    gap: 0.45rem;
  }

  .examples-section {
    min-height: 0;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .examples-section:empty {
    display: none;
  }

  .section-heading {
    justify-content: space-between;
    color: #62727a;
  }

  .example-list {
    min-height: 0;
    display: grid;
    gap: 0.2rem;
    overflow: auto;
    padding: 0 0.25rem 0.2rem 0;
  }

  :global(.example-action) {
    justify-content: stretch;
    width: 100%;
    border-radius: 0.35rem;
    color: #152027;
  }

  .trace-dot {
    width: 0.48rem;
    height: 0.48rem;
    border-radius: 999px;
    background: #0f8f83;
    box-shadow: 0 0 0 3px rgba(15, 143, 131, 0.12);
  }

  .upload-section {
    padding: 0.5rem;
    border: 1px solid #b9c8ce;
    border-radius: 0.45rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(246, 248, 248, 0.94)), #ffffff;
  }

  .file-action {
    min-height: 1.95rem;
    justify-content: center;
    gap: 0.4rem;
    padding: 0 0.55rem;
    border: 1px solid #b9c8ce;
    border-radius: 0.35rem;
    background: #f7fafa;
    color: #152027;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .file-action.primary {
    border-color: #152027;
    background: #152027;
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

  .upload-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .upload-section p.error {
    color: #9d2f25;
    font-weight: 650;
  }

  @media (max-width: 960px) {
    .source-panel.collapsed {
      height: auto;
      min-height: 3rem;
      justify-items: start;
      border-right: 0;
      border-bottom: 1px solid #c8d6dc;
    }

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
