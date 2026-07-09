<script lang="ts">
  import { Badge } from '@lostgradient/cinder/badge';
  import { EmptyState } from '@lostgradient/cinder/empty-state';
  import { Stat } from '@lostgradient/cinder/stat';
  import { StatGroup } from '@lostgradient/cinder/stat-group';
  import { Table } from '@lostgradient/cinder/table';
  import { TableBody } from '@lostgradient/cinder/table-body';
  import { TableCell } from '@lostgradient/cinder/table-cell';
  import { TableHeader } from '@lostgradient/cinder/table-header';
  import { TableHeaderCell } from '@lostgradient/cinder/table-header-cell';
  import { TableRow } from '@lostgradient/cinder/table-row';

  import type { GraphProjection } from '$lib/graph/projection';
  import { sourceText } from '$lib/graph/projection';
  import { statusBadgeVariant } from '$lib/graph/runtime-display';

  import type {
    QueryDefinition,
    SignalDefinition,
    UpdateDefinition,
  } from '@temporal-explorer/schemas';

  type MessageDefinition = SignalDefinition | QueryDefinition | UpdateDefinition;

  type Props = {
    signals: SignalDefinition[];
    queries: QueryDefinition[];
    updates: UpdateDefinition[];
    graphProjection: GraphProjection | undefined;
  };

  let { signals, queries, updates, graphProjection }: Props = $props();

  function payloadTypeText(definition: MessageDefinition): string {
    return definition.args.length > 0
      ? definition.args.map((argument) => argument.display).join(', ')
      : 'none';
  }

  function resultTypeText(definition: QueryDefinition | UpdateDefinition): string {
    return definition.result ? definition.result.display : 'void';
  }

  function liveState(id: string): GraphProjection['nodes'][number]['state'] | undefined {
    return graphProjection?.nodesById.get(id)?.state;
  }

  const messageCount = $derived(signals.length + queries.length + updates.length);
</script>

<StatGroup
  label="Message surface summary"
  columns={3}
  variant="shared-borders"
  class="message-summary"
>
  <Stat label="Signals" value={signals.length} />
  <Stat label="Queries" value={queries.length} />
  <Stat label="Updates" value={updates.length} />
</StatGroup>

{#if messageCount > 0}
  {#if signals.length > 0}
    <div class="table-panel">
      <Table caption="Signal handlers" density="condensed">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Signal</TableHeaderCell>
            <TableHeaderCell>Payload type</TableHeaderCell>
            <TableHeaderCell>Handler source</TableHeaderCell>
            <TableHeaderCell>State</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each signals as signal (signal.id)}
            <TableRow>
              <TableCell as="th">{signal.name}</TableCell>
              <TableCell>{payloadTypeText(signal)}</TableCell>
              <TableCell>{sourceText(signal.handlerSource)}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(liveState(signal.id))} size="sm">
                  {liveState(signal.id) ?? 'not observed'}
                </Badge>
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  {/if}

  {#if queries.length > 0}
    <div class="table-panel">
      <Table caption="Query handlers" density="condensed">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Query</TableHeaderCell>
            <TableHeaderCell>Payload type</TableHeaderCell>
            <TableHeaderCell>Result type</TableHeaderCell>
            <TableHeaderCell>Handler source</TableHeaderCell>
            <TableHeaderCell>State</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each queries as query (query.id)}
            <TableRow>
              <TableCell as="th">{query.name}</TableCell>
              <TableCell>{payloadTypeText(query)}</TableCell>
              <TableCell>{resultTypeText(query)}</TableCell>
              <TableCell>{sourceText(query.handlerSource)}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(liveState(query.id))} size="sm">
                  {liveState(query.id) ?? 'not observed'}
                </Badge>
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
      <p class="message-note">
        Queries never appear in Event History. They read Workflow state directly, so there is no
        runtime event evidence to map.
      </p>
    </div>
  {/if}

  {#if updates.length > 0}
    <div class="table-panel">
      <Table caption="Update handlers" density="condensed">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Update</TableHeaderCell>
            <TableHeaderCell>Payload type</TableHeaderCell>
            <TableHeaderCell>Result type</TableHeaderCell>
            <TableHeaderCell>Handler source</TableHeaderCell>
            <TableHeaderCell>Validator source</TableHeaderCell>
            <TableHeaderCell>State</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {#each updates as update (update.id)}
            <TableRow>
              <TableCell as="th">{update.name}</TableCell>
              <TableCell>{payloadTypeText(update)}</TableCell>
              <TableCell>{resultTypeText(update)}</TableCell>
              <TableCell>{sourceText(update.handlerSource)}</TableCell>
              <TableCell>{sourceText(update.validatorSource)}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(liveState(update.id))} size="sm">
                  {liveState(update.id) ?? 'not observed'}
                </Badge>
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </div>
  {/if}
{:else}
  <EmptyState
    title="No messages"
    description="This Workflow does not declare signal, query, or update handlers."
    headingLevel={2}
  />
{/if}

<style>
  :global(.message-summary) {
    margin-bottom: 0.7rem;
    border-color: #c3d0d5;
    border-radius: 0.4rem;
    background: #ffffff;
  }

  :global(.message-summary .cinder-stat) {
    padding: 0.45rem 0.7rem;
  }

  :global(.message-summary .cinder-stat__label) {
    font-size: 0.7rem;
    letter-spacing: 0;
    text-transform: none;
  }

  :global(.message-summary .cinder-stat__value) {
    font-size: 1rem;
    line-height: 1.1;
  }

  .table-panel {
    margin-bottom: 1rem;
    overflow-x: auto;
    border: 1px solid #c3d0d5;
    border-radius: 0.45rem;
    background: #ffffff;
  }

  .message-note {
    margin: 0;
    padding: 0.75rem 0.95rem;
    border-top: 1px solid #c3d0d5;
    color: #62727a;
    font-size: 0.8125rem;
  }
</style>
