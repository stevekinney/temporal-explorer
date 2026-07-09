<script lang="ts">
  import {
    runtimeOverlayStates,
    runtimeStateToken,
    type RuntimeOverlayState,
  } from '$lib/graph/projection';
  import { Button } from '@lostgradient/cinder/button';
  import { ButtonGroup } from '@lostgradient/cinder/button-group';
  import { Popover } from '@lostgradient/cinder/popover';
  import { Segment } from '@lostgradient/cinder/segment';
  import { SegmentedControl } from '@lostgradient/cinder/segmented-control';
  import { Info, Maximize2, MousePointer2 } from 'lucide-svelte';

  type Props = {
    traceArtifactId: string | undefined;
    hasRuntime: boolean;
    visibleFilterStates: RuntimeOverlayState[];
    statusFilter: RuntimeOverlayState | 'all';
    filterableNodeCount: number;
    statusCounts: Map<RuntimeOverlayState, number>;
    hasSelection: boolean;
    fitGraph: () => void;
    clearGraphSelection: () => void;
  };

  let {
    traceArtifactId,
    hasRuntime,
    visibleFilterStates,
    statusFilter = $bindable(),
    filterableNodeCount,
    statusCounts,
    hasSelection,
    fitGraph,
    clearGraphSelection,
  }: Props = $props();

  let legendOpen = $state(false);
</script>

<div class="flow-toolbar">
  <div class="toolbar-title">
    <h2>Flow projection</h2>
    <span>{traceArtifactId ?? 'static analysis only'}</span>
  </div>
  {#if hasRuntime && visibleFilterStates.length > 0}
    <SegmentedControl
      id="runtime-state-filters"
      bind:value={statusFilter}
      label="Runtime state filters"
      hideLabel
      density="toolbar"
      detached
      class="state-filters"
    >
      <Segment value="all">
        All
        <span class="filter-count">{filterableNodeCount}</span>
      </Segment>
      {#each visibleFilterStates as state (state)}
        <Segment value={state} data-state={runtimeStateToken(state)}>
          {state}
          <span class="filter-count">{statusCounts.get(state) ?? 0}</span>
        </Segment>
      {/each}
    </SegmentedControl>
  {/if}
  <div class="toolbar-actions" aria-label="Flow projection controls">
    <ButtonGroup label="Graph view controls" class="graph-action-group">
      <Button
        variant="secondary"
        size="sm"
        iconOnly
        aria-label="Fit graph"
        title="Fit graph"
        onclick={fitGraph}
      >
        <Maximize2 size={15} aria-hidden="true" />
      </Button>
      <span class="zoom-readout" aria-label="Current zoom">100%</span>
    </ButtonGroup>
    {#if hasSelection}
      <Button
        variant="secondary"
        size="sm"
        iconOnly
        aria-label="Clear selection"
        title="Clear selection"
        onclick={clearGraphSelection}
      >
        <MousePointer2 size={15} aria-hidden="true" />
      </Button>
    {/if}
    <Popover
      bind:open={legendOpen}
      label="Runtime state legend"
      placement="bottom-end"
      focusManagement="preserve"
    >
      {#snippet trigger()}
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label="Show runtime state legend"
          title="Show runtime state legend"
        >
          <Info size={15} aria-hidden="true" />
        </Button>
      {/snippet}
      <div class="state-legend">
        {#each runtimeOverlayStates as state (state)}
          <span data-state={runtimeStateToken(state)}>{state}</span>
        {/each}
      </div>
    </Popover>
  </div>
</div>

<style>
  .flow-toolbar {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) auto auto;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.55rem;
    border-bottom: 1px solid #c3d0d5;
    background: rgba(248, 251, 252, 0.9);
  }

  .flow-toolbar h2 {
    margin: 0;
    font-size: 0.88rem;
    letter-spacing: 0;
  }

  .toolbar-title {
    min-width: 0;
  }

  .flow-toolbar span {
    color: #62727a;
    font-size: 0.75rem;
  }

  .toolbar-title span {
    display: block;
    max-width: 11rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  :global(.graph-action-group.cinder-button-group) {
    align-items: center;
  }

  :global(.graph-action-group.cinder-button-group .cinder-button:first-child) {
    border-start-end-radius: 0;
    border-end-end-radius: 0;
  }

  .zoom-readout {
    position: relative;
    display: inline-grid;
    place-items: center;
    min-width: 2.5rem;
    height: 2rem;
    margin-inline-start: -1px;
    padding: 0 0.45rem;
    border: 1px solid #b9c8ce;
    border-start-end-radius: 0.35rem;
    border-end-end-radius: 0.35rem;
    background: #f8fbfb;
    color: #62727a;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.72rem;
    line-height: 1;
  }

  :global(.toolbar-actions .cinder-button[aria-label]) {
    width: 2rem;
    min-width: 2rem;
    padding-inline: 0;
  }

  :global(.state-filters) {
    min-width: 10rem;
    max-width: 12rem;
    overflow-x: auto;
    gap: 0.35rem;
  }

  :global(.state-filters .cinder-segmented-control-option) {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.4rem;
    border-color: #b9c8ce;
    background: #ffffff;
  }

  :global(.state-filters .cinder-segmented-control-option[data-cinder-selected]) {
    z-index: 1;
    border-color: #3468f6;
    background: #3468f6;
  }

  :global(.state-filters [data-state]::before),
  .state-legend span::before {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #87979f;
  }

  :global(.state-filters [data-state='completed']::before),
  :global(.state-filters [data-state='observed']::before),
  :global(.state-filters [data-state='fired']::before),
  .state-legend span[data-state='completed']::before,
  .state-legend span[data-state='observed']::before,
  .state-legend span[data-state='fired']::before {
    background: #0f8f83;
  }

  :global(.state-filters [data-state='failed']::before),
  :global(.state-filters [data-state='timed-out']::before),
  :global(.state-filters [data-state='canceled']::before),
  .state-legend span[data-state='failed']::before,
  .state-legend span[data-state='timed-out']::before,
  .state-legend span[data-state='canceled']::before {
    background: #b84437;
  }

  :global(.state-filters [data-state='retried']::before),
  :global(.state-filters [data-state='pending']::before),
  :global(.state-filters [data-state='ambiguous']::before),
  .state-legend span[data-state='retried']::before,
  .state-legend span[data-state='pending']::before,
  .state-legend span[data-state='ambiguous']::before {
    background: #c97814;
  }

  :global(.state-filters [data-state='unmapped']::before),
  .state-legend span[data-state='unmapped']::before {
    background: #3468f6;
  }

  :global(.state-filters .filter-count) {
    display: inline-grid;
    place-items: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: #e2ebee;
    color: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    opacity: 0.78;
  }

  .state-legend {
    display: grid;
    gap: 0.45rem;
    min-width: 12rem;
    padding: 0.25rem;
  }

  .state-legend span {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #2d3d45;
    font-size: 0.8125rem;
  }

  @media (max-width: 840px) {
    .flow-toolbar {
      align-items: stretch;
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
