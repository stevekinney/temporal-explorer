<script lang="ts">
  import { ActionRow } from '@lostgradient/cinder/action-row';
  import { Badge } from '@lostgradient/cinder/badge';
  import { EmptyState } from '@lostgradient/cinder/empty-state';

  import { type TimelineRow } from '$lib/graph/projection';
  import { runtimeStateToken } from '$lib/graph/runtime-state';
  import {
    compactEventSummary,
    formatTimestamp,
    statusBadgeVariant,
  } from '$lib/graph/runtime-display';

  type Props = {
    rows: TimelineRow[];
    selectedRuntimeOperationId: string | undefined;
    selectTimelineRow: (row: TimelineRow) => void;
  };

  let { rows, selectedRuntimeOperationId, selectTimelineRow }: Props = $props();
</script>

<section class="timeline-panel" aria-labelledby="timeline-title">
  <div class="panel-heading">
    <div>
      <h2 id="timeline-title">Event History Timeline</h2>
      <p>Runtime operations and raw Event History evidence</p>
    </div>
    <div class="heading-badges">
      {#if selectedRuntimeOperationId}
        <Badge variant="info" size="sm">Inspector selection</Badge>
      {/if}
      <Badge variant="neutral" size="sm">{rows.length} events</Badge>
    </div>
  </div>

  {#if rows.length > 0}
    <div class="timeline-list" role="list">
      {#each rows as row (row.id)}
        <ActionRow
          density="condensed"
          selected={row.entry.operationId === selectedRuntimeOperationId}
          selectedState="current"
          onclick={() => selectTimelineRow(row)}
        >
          {#snippet leading()}
            <span class="timeline-dot" data-state={runtimeStateToken(row.state)}></span>
          {/snippet}
          {#snippet title()}
            <span class="row-title">{row.entry.label}</span>
          {/snippet}
          {#snippet description()}
            <span>{row.sourceText}</span>
          {/snippet}
          {#snippet meta()}
            <code>
              {row.eventReferences.length > 0
                ? compactEventSummary(row.eventReferences)
                : `events ${row.entry.eventIds.map((eventId) => `#${eventId}`).join(', ')}`}
            </code>
          {/snippet}
          {#snippet trailing()}
            <span class="timeline-trailing">
              {#if row.entry.operationId === selectedRuntimeOperationId}
                <Badge variant="info" size="sm">selected</Badge>
              {/if}
              <Badge variant={statusBadgeVariant(row.state)} size="sm">{row.state}</Badge>
              <time>{formatTimestamp(row.entry.at)}</time>
            </span>
          {/snippet}
        </ActionRow>
      {/each}
    </div>
  {:else}
    <EmptyState title="No timeline rows" headingLevel={3} />
  {/if}
</section>

<style>
  .timeline-panel {
    min-width: 0;
    border: 1px solid #b9c8ce;
    border-radius: 0.45rem;
    background: #ffffff;
    box-shadow: 0 8px 18px rgba(21, 32, 39, 0.06);
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.9rem;
    border-bottom: 1px solid #c3d0d5;
    background: #f8fbfb;
  }

  .panel-heading h2,
  .panel-heading p {
    margin: 0;
  }

  .panel-heading h2 {
    font-size: 0.95rem;
    letter-spacing: 0;
  }

  .panel-heading p {
    margin-top: 0.15rem;
    color: #62727a;
    font-size: 0.75rem;
  }

  .heading-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .timeline-list {
    display: grid;
    gap: 0.25rem;
    max-height: 14rem;
    overflow: auto;
    padding: 0.55rem;
  }

  .timeline-list :global(.cinder-action-row) {
    border-radius: 0.4rem;
  }

  .timeline-list :global(.cinder-action-row__layout) {
    align-items: center;
    gap: 0.8rem;
    padding-block: 0.55rem;
  }

  .timeline-list :global(.cinder-action-row__body) {
    min-width: 0;
  }

  .timeline-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 999px;
    background: #87979f;
  }

  .timeline-dot[data-state='completed'],
  .timeline-dot[data-state='observed'],
  .timeline-dot[data-state='fired'] {
    background: #0f8f83;
  }

  .timeline-dot[data-state='failed'],
  .timeline-dot[data-state='timed-out'],
  .timeline-dot[data-state='canceled'] {
    background: #b84437;
  }

  .timeline-dot[data-state='retried'],
  .timeline-dot[data-state='pending'],
  .timeline-dot[data-state='ambiguous'] {
    background: #c97814;
  }

  .row-title {
    font-weight: 720;
  }

  code,
  time {
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.72rem;
  }

  .timeline-trailing {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.6rem;
    min-width: 13rem;
    color: #62727a;
  }
</style>
