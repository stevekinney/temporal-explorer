<script lang="ts">
  import { Badge } from '$cinder-components/badge';
  import { EmptyState } from '$cinder-components/empty-state';

  import { runtimeStateToken, type TimelineRow } from '$lib/graph/projection';
  import { compactEventSummary, formatTimestamp } from '$lib/graph/runtime-display';

  type Props = {
    rows: TimelineRow[];
    selectedRuntimeOperationId: string | undefined;
    selectTimelineRow: (row: TimelineRow) => void;
  };

  let { rows, selectedRuntimeOperationId, selectTimelineRow }: Props = $props();
</script>

<section class="timeline-panel" aria-labelledby="timeline-title">
  <div class="panel-heading">
    <h2 id="timeline-title">Timeline</h2>
    <Badge variant="info" size="sm">{rows.length}</Badge>
  </div>
  <div class="timeline-list">
    {#each rows as row (row.id)}
      <button
        type="button"
        class="timeline-item"
        data-active={row.entry.operationId === selectedRuntimeOperationId ? 'true' : undefined}
        data-state={runtimeStateToken(row.state)}
        onclick={() => selectTimelineRow(row)}
      >
        <span>{formatTimestamp(row.entry.at)}</span>
        <strong>{row.entry.label}</strong>
        <small>
          {row.eventReferences.length > 0
            ? compactEventSummary(row.eventReferences)
            : `events ${row.entry.eventIds.map((eventId) => `#${eventId}`).join(', ')}`}
        </small>
      </button>
    {:else}
      <EmptyState title="No timeline rows" headingLevel={3} />
    {/each}
  </div>
</section>

<style>
  .timeline-panel {
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

  .timeline-list {
    display: grid;
    gap: 0.5rem;
    max-height: 22rem;
    padding: 0.75rem;
    overflow: auto;
  }

  .timeline-item {
    display: grid;
    /* The timestamp is a fixed-width `HH:MM:SS.mmm` string; the column must be wide
       enough to hold all twelve monospace characters or it overruns the label. */
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: 0.15rem 0.75rem;
    width: 100%;
    padding: 0.6rem 0.65rem;
    /* Borderless rows: on a white panel the per-item border + fill read as
       nested boxes; spacing and a hover tint separate them more quietly. The
       transparent border reserves the box so the active state adds no shift. */
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

  .timeline-item:hover {
    background: #f4f8fb;
  }

  .timeline-item[data-active='true'] {
    border-color: #2f6fed;
    background: #f2f6ff;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.16);
  }

  .timeline-item span,
  .timeline-item small {
    color: #5d6b75;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.75rem;
  }

  .timeline-item span {
    white-space: nowrap;
  }

  .timeline-item small {
    grid-column: 2;
  }

  .timeline-item strong {
    overflow-wrap: anywhere;
  }
</style>
