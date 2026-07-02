<script lang="ts">
  import { Badge } from '$cinder-components/badge';

  import { formatEventReferences, type RuntimeOverlayState } from '$lib/graph/projection';
  import { formatTimestamp, statusBadgeVariant } from '$lib/graph/runtime-display';

  import type { EventReference, RuntimeOperation } from '@temporal-explorer/schemas';

  type Props = {
    title: string;
    state: RuntimeOverlayState | undefined;
    source: string;
    eventReferences: EventReference[];
    reason: string | undefined;
    operation: RuntimeOperation | undefined;
  };

  let { title, state, source, eventReferences, reason, operation }: Props = $props();
</script>

<aside class="selection-inspector" aria-label="Selection inspector">
  <div class="panel-heading">
    <h2>Inspector</h2>
    {#if state}
      <Badge variant={statusBadgeVariant(state)} size="sm">{state}</Badge>
    {/if}
  </div>
  <div class="inspector-details">
    <section>
      <span>Selection</span>
      <strong>{title}</strong>
    </section>
    <section>
      <span>Source</span>
      <code>{source}</code>
    </section>
    <section>
      <span>Raw event references</span>
      <code>
        {eventReferences.length > 0 ? formatEventReferences(eventReferences) : 'none'}
      </code>
    </section>
    {#if reason}
      <section>
        <span>Mapping reason</span>
        <p>{reason}</p>
      </section>
    {/if}
    {#if operation?.kind === 'timer'}
      <section>
        <span>Timer status</span>
        <strong>{operation.status}</strong>
      </section>
      <section>
        <span>Timer duration</span>
        <strong>{operation.durationText ?? 'pending'}</strong>
      </section>
    {/if}
    {#if operation?.kind === 'signal'}
      <section>
        <span>Signal received</span>
        <strong>{formatTimestamp(operation.receivedAt)}</strong>
      </section>
    {/if}
  </div>
</aside>

<style>
  .selection-inspector {
    min-width: 0;
    padding-bottom: 0.25rem;
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

  .inspector-details {
    display: grid;
    gap: 1rem;
    padding: 0.85rem 0.95rem;
  }

  .inspector-details section {
    display: grid;
    gap: 0.35rem;
  }

  .inspector-details span {
    color: #5d6b75;
    font-size: 0.8125rem;
  }

  .inspector-details strong {
    color: #172026;
    overflow-wrap: anywhere;
  }

  .inspector-details p {
    margin: 0;
    color: #34434f;
  }

  code {
    display: block;
    padding: 0.625rem 0;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
