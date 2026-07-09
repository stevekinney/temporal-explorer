<script lang="ts">
  import { Accordion } from '@lostgradient/cinder/accordion';
  import { AccordionItem } from '@lostgradient/cinder/accordion-item';
  import { Badge } from '@lostgradient/cinder/badge';
  import { Button } from '@lostgradient/cinder/button';
  import { Card } from '@lostgradient/cinder/card';
  import { CopyButton } from '@lostgradient/cinder/copy-button';
  import { Braces, ClipboardCopy } from 'lucide-svelte';

  import { formatTimestamp, statusBadgeVariant } from '$lib/graph/runtime-display';

  import type { SelectionDetail, SelectionFact } from './workflow-selection';

  type Props = {
    detail: SelectionDetail;
  };

  let { detail }: Props = $props();
  let expandedSections = $state(['source', 'mapping', 'runtime', 'events']);

  const eventIdText = $derived(
    detail.eventReferences.map((reference) => `#${reference.eventId}`).join(', '),
  );

  function factTone(fact: SelectionFact): string {
    return fact.tone ?? 'neutral';
  }

  function readableEventType(eventType: string): string {
    return eventType.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
</script>

<aside class="selection-inspector" aria-label="Selection evidence">
  <Card padding="none">
    {#snippet header()}
      <div class="inspector-hero">
        <div class="accent" aria-hidden="true"></div>
        <div>
          <div class="title-row">
            <h2>{detail.title}</h2>
            {#if detail.state}
              <Badge variant={statusBadgeVariant(detail.state)} size="sm">{detail.state}</Badge>
            {/if}
          </div>
          <p>{detail.subtitle}</p>
        </div>
      </div>
    {/snippet}

    <Accordion multiple bind:expandedIds={expandedSections} class="inspector-sections">
      <AccordionItem id="source" title="Source">
        <code class="source-path">{detail.sourceText}</code>
        <code class="source-line">{detail.sourceLineText}</code>
      </AccordionItem>

      <AccordionItem id="mapping" title="Mapping">
        <div class="fact-stack">
          {#each detail.mappingFacts as fact (fact.label)}
            <div class="fact-row" data-tone={factTone(fact)}>
              <span>{fact.label}</span>
              <span class="fact-value">{fact.value}</span>
            </div>
          {/each}
        </div>
      </AccordionItem>

      {#if detail.runtimeFacts.length > 0}
        <AccordionItem id="runtime" title="Runtime outcome">
          <div class="fact-grid">
            {#each detail.runtimeFacts as fact (fact.label)}
              <div data-tone={factTone(fact)}>
                <span>{fact.label}</span>
                <span class="fact-value">{fact.value}</span>
              </div>
            {/each}
          </div>
        </AccordionItem>
      {/if}

      <AccordionItem id="events" title="Event History">
        {#if detail.eventLedger.length > 0}
          <ol class="event-ledger">
            {#each detail.eventLedger as reference (reference.eventId)}
              <li>
                <span>#{reference.eventId}</span>
                <span class="event-type">{readableEventType(reference.eventType)}</span>
                {#if detail.timelineRows[0]}
                  <time>{formatTimestamp(detail.timelineRows[0].entry.at)}</time>
                {/if}
              </li>
            {/each}
          </ol>
        {:else}
          <p class="muted">No runtime Event History was mapped to this selection.</p>
        {/if}
      </AccordionItem>

      <AccordionItem id="actions" title="Actions">
        <div class="inspector-actions">
          <CopyButton value={eventIdText || detail.title} label="Copy event IDs">
            <ClipboardCopy size={15} aria-hidden="true" />
            Copy event IDs
          </CopyButton>
          <Button variant="secondary" size="sm" disabled>
            <Braces size={15} aria-hidden="true" />
            Show raw JSON
          </Button>
        </div>
      </AccordionItem>
    </Accordion>
  </Card>
</aside>

<style>
  .selection-inspector {
    min-width: 0;
  }

  .inspector-hero {
    display: grid;
    grid-template-columns: 0.2rem minmax(0, 1fr);
    gap: 0.6rem;
    align-items: start;
    padding: 0.58rem 0.75rem;
    border-bottom: 1px solid #c3d0d5;
  }

  .accent {
    width: 0.2rem;
    height: 100%;
    min-height: 2.35rem;
    border-radius: 999px;
    background: #0f8f83;
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
  }

  .inspector-hero h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0;
  }

  .inspector-hero p {
    margin: 0.2rem 0 0;
    color: #62727a;
    font-size: 0.76rem;
  }

  :global(.selection-inspector > .cinder-card) {
    background: #ffffff;
  }

  :global(.inspector-sections.cinder-accordion) {
    border: 0;
    border-radius: 0;
    background: #ffffff;
  }

  :global(.inspector-sections .cinder-accordion-item) {
    border-bottom: 1px solid #d5e0e4;
    background: #ffffff;
  }

  :global(.inspector-sections .cinder-accordion-item:last-child) {
    border-bottom: 0;
  }

  :global(.inspector-sections .cinder-accordion-item__trigger) {
    min-height: 2.45rem;
    padding: 0 0.9rem;
    font-size: 0.78rem;
    font-weight: 650;
  }

  :global(.inspector-sections .cinder-accordion-item__panel) {
    background: #ffffff;
  }

  :global(.inspector-sections .cinder-accordion-item__panel-inner) {
    padding: 0.35rem 0.9rem 0.95rem;
    background: #ffffff;
  }

  .source-path,
  .source-line {
    display: block;
    overflow-wrap: anywhere;
    font-size: 0.72rem;
  }

  .source-path {
    margin-bottom: 0.45rem;
    color: #3468f6;
  }

  .source-line {
    padding: 0.65rem 0.75rem;
    border: 1px solid #d5e0e4;
    border-radius: 0.35rem;
    background: #f8fbfb;
    color: #14242b;
  }

  .fact-stack {
    display: grid;
    gap: 0.55rem;
  }

  .fact-row {
    display: grid;
    gap: 0.2rem;
  }

  .fact-row span,
  .fact-grid span {
    color: #62727a;
    font-size: 0.72rem;
  }

  .fact-value {
    color: #14242b;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .fact-row[data-tone='success'] .fact-value,
  .fact-grid [data-tone='success'] .fact-value {
    color: #0f746b;
  }

  .fact-row[data-tone='warning'] .fact-value,
  .fact-grid [data-tone='warning'] .fact-value {
    color: #9b5c00;
  }

  .fact-row[data-tone='danger'] .fact-value,
  .fact-grid [data-tone='danger'] .fact-value {
    color: #a33a2f;
  }

  .fact-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
  }

  .event-ledger {
    display: grid;
    gap: 0.55rem;
    margin: 0;
    padding: 0.15rem 0 0.15rem 0.9rem;
    list-style: none;
  }

  .event-ledger li {
    display: grid;
    grid-template-columns: 2.4rem minmax(0, 1fr) auto;
    gap: 0.65rem;
    align-items: center;
    position: relative;
  }

  .event-ledger li::before {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    position: absolute;
    left: -0.05rem;
    border-radius: 999px;
    background: #3468f6;
    transform: translateX(-0.9rem);
  }

  .event-ledger span,
  .event-ledger time {
    color: #62727a;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.7rem;
  }

  .event-type {
    color: #14242b;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.72rem;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .muted {
    margin: 0;
    color: #62727a;
    font-size: 0.8rem;
  }

  .inspector-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
  }

  :global(.inspector-actions .cinder-copy-button) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2rem;
    border: 1px solid #b9c8ce;
    border-radius: 0.35rem;
    background: #ffffff;
    color: #14242b;
    font-size: 0.78rem;
    font-weight: 650;
  }
</style>
