<script lang="ts">
  import { Badge } from '$cinder-components/badge';

  import { compactEventSummary } from '$lib/graph/runtime-display';
  import type { TemporalGraphEdge } from '$lib/graph/projection';

  import { Waypoints } from 'lucide-svelte';

  type Props = {
    edges: TemporalGraphEdge[];
    selectedEdgeId: string | undefined;
    selectEdge: (edgeId: string) => void;
  };

  let { edges, selectedEdgeId, selectEdge }: Props = $props();
</script>

<section class="edge-panel" aria-labelledby="edge-title">
  <div class="panel-heading">
    <h2 id="edge-title">Edges</h2>
    <Badge variant="neutral" size="sm">{edges.length}</Badge>
  </div>
  <div class="edge-list">
    {#each edges as edge (edge.id)}
      <button
        type="button"
        class="edge-item"
        data-active={edge.id === selectedEdgeId ? 'true' : undefined}
        onclick={() => selectEdge(edge.id)}
      >
        <span class="edge-icon" aria-hidden="true">
          <Waypoints size={15} />
        </span>
        <span>{edge.label} edge</span>
        <small>{compactEventSummary(edge.eventReferences)}</small>
      </button>
    {/each}
  </div>
</section>

<style>
  .edge-panel {
    min-width: 0;
    border: 1px solid #d3dde5;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(22, 32, 38, 0.05);
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 0.95rem;
    border-bottom: 1px solid #dde5eb;
  }

  .panel-heading h2 {
    margin: 0;
    font-size: 0.95rem;
  }

  .edge-list {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .edge-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.15rem 0.55rem;
    align-items: center;
    width: 100%;
    padding: 0.55rem 0.65rem;
    /* Borderless rows (see timeline panel): quieter than nested white cards. */
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: transparent;
    color: #172026;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  .edge-item:hover {
    background: #f4f8fb;
  }

  .edge-item[data-active='true'] {
    border-color: #2f6fed;
    background: #f2f6ff;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.16);
  }

  .edge-icon {
    display: inline-grid;
    grid-row: span 2;
    place-items: center;
    color: #5d6b75;
  }

  .edge-item span,
  .edge-item small {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .edge-item small {
    color: #5d6b75;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.75rem;
  }
</style>
