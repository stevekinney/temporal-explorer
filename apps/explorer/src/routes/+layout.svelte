<script lang="ts">
  import cinderStylesheetUrl from '@lostgradient/cinder/styles/all?url';
  import svelteFlowStylesheetUrl from '@xyflow/svelte/dist/style.css?url';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <link rel="stylesheet" href={cinderStylesheetUrl} />
  <link rel="stylesheet" href={svelteFlowStylesheetUrl} />
</svelte:head>

{@render children()}

<style>
  :global(html) {
    color-scheme: light;
    background: #e8eef0;
    font-family:
      'Inter',
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  :global(body) {
    margin: 0;
    min-width: 320px;
    background:
      linear-gradient(90deg, rgba(15, 143, 131, 0.09) 1px, transparent 1px),
      linear-gradient(180deg, rgba(52, 104, 246, 0.05) 1px, transparent 1px),
      radial-gradient(circle at 0 0, rgba(15, 143, 131, 0.08), transparent 26rem),
      linear-gradient(180deg, #f6f8f8 0%, #e8eef0 100%);
    background-size:
      56px 56px,
      56px 56px,
      auto,
      auto;
    color: #152027;
  }

  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
  }
</style>
