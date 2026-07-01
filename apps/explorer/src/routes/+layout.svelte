<script lang="ts">
  import cinderStylesheetUrl from '@lostgradient/cinder/styles?url';
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
    background: #eef2f5;
    font-family:
      Inter,
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
      linear-gradient(90deg, rgba(47, 111, 237, 0.08) 1px, transparent 1px),
      linear-gradient(180deg, #f7f9fb 0%, #edf2f5 100%);
    background-size:
      64px 64px,
      auto;
    color: #172026;
  }

  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
  }
</style>
