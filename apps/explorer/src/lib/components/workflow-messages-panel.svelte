<script lang="ts">
  import { Badge } from '$cinder-components/badge';
  import { Card } from '$cinder-components/card';
  import { EmptyState } from '$cinder-components/empty-state';
  import { Table } from '$cinder-components/table';
  import { TableBody } from '$cinder-components/table-body';
  import { TableCell } from '$cinder-components/table-cell';
  import { TableHeader } from '$cinder-components/table-header';
  import { TableHeaderCell } from '$cinder-components/table-header-cell';
  import { TableRow } from '$cinder-components/table-row';

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
</script>

<div class="message-grid">
  <Card title="Signals" headingLevel={2}>
    <strong>{signals.length}</strong>
    <span>static signals</span>
  </Card>
  <Card title="Queries" headingLevel={2}>
    <strong>{queries.length}</strong>
    <span>static queries</span>
  </Card>
  <Card title="Updates" headingLevel={2}>
    <strong>{updates.length}</strong>
    <span>static updates</span>
  </Card>
</div>

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
{:else}
  <EmptyState
    title="No signals"
    description="This Workflow does not declare any signal handlers."
    headingLevel={2}
  />
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
      Queries never appear in Event History — they read Workflow state directly, so there is no
      runtime evidence to observe beyond static analysis.
    </p>
  </div>
{:else}
  <EmptyState
    title="No queries"
    description="This Workflow does not declare any query handlers."
    headingLevel={2}
  />
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
{:else}
  <EmptyState
    title="No updates"
    description="This Workflow does not declare any update handlers."
    headingLevel={2}
  />
{/if}

<style>
  .message-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .message-grid strong {
    display: block;
    color: #2f6fed;
    font-size: 2rem;
    line-height: 1;
  }

  .message-grid span {
    color: #5d6b75;
    font-size: 0.875rem;
  }

  .table-panel {
    margin-bottom: 1rem;
    overflow-x: auto;
    border: 1px solid #d3dde5;
    border-radius: 0.5rem;
    background: #ffffff;
  }

  .message-note {
    margin: 0;
    padding: 0.75rem 0.95rem;
    border-top: 1px solid #dde5eb;
    color: #5d6b75;
    font-size: 0.8125rem;
  }

  @media (max-width: 840px) {
    .message-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
