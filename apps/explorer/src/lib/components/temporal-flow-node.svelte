<script lang="ts" module>
  import type { RuntimeOverlayState } from '$lib/graph/projection';

  export type TemporalFlowNodeData = Record<string, unknown> & {
    label: string;
    kind: 'workflow' | 'activity' | 'timer' | 'condition' | 'signal' | 'runtime';
    state: RuntimeOverlayState;
    sourceText: string;
    eventSummary: string;
    active: boolean;
    muted: boolean;
  };
</script>

<script lang="ts">
  import { Badge } from '$cinder-components/badge';
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';

  import { runtimeStateToken } from '$lib/graph/projection';
  import { statusBadgeVariant } from '$lib/graph/runtime-display';

  let { data }: NodeProps = $props();
  const nodeData = $derived(data as TemporalFlowNodeData);
</script>

<div
  class="temporal-flow-node"
  data-active={nodeData.active ? 'true' : undefined}
  data-muted={nodeData.muted ? 'true' : undefined}
  data-kind={nodeData.kind}
  data-state={runtimeStateToken(nodeData.state)}
>
  <Handle
    type="target"
    position={Position.Left}
    class="temporal-handle"
    role="presentation"
    aria-hidden="true"
  />
  <Handle
    type="source"
    position={Position.Right}
    class="temporal-handle"
    role="presentation"
    aria-hidden="true"
  />
  <div class="node-kicker">
    <span>{nodeData.kind}</span>
    <Badge variant={statusBadgeVariant(nodeData.state)} size="xs">{nodeData.state}</Badge>
  </div>
  <strong>{nodeData.label}</strong>
  <span class="node-source">{nodeData.sourceText}</span>
  {#if nodeData.eventSummary}
    <span class="node-events">{nodeData.eventSummary}</span>
  {/if}
</div>

<style>
  .temporal-flow-node {
    position: relative;
    display: grid;
    gap: 0.45rem;
    width: 14rem;
    min-height: 6.4rem;
    padding: 0.75rem;
    border: 1px solid #b7c6d1;
    border-left: 0.35rem solid #5f6f7a;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #172026;
    box-shadow: 0 10px 24px rgba(23, 32, 38, 0.12);
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease,
      opacity 120ms ease;
  }

  .temporal-flow-node[data-kind='workflow'] {
    border-left-color: #2f6fed;
  }

  .temporal-flow-node[data-kind='activity'] {
    border-left-color: #18845b;
  }

  .temporal-flow-node[data-kind='timer'] {
    border-left-color: #b76b00;
  }

  .temporal-flow-node[data-kind='condition'] {
    border-left-color: #0f7a8c;
  }

  .temporal-flow-node[data-kind='signal'] {
    border-left-color: #c9436e;
  }

  .temporal-flow-node[data-kind='runtime'] {
    border-left-color: #7a4cc2;
  }

  .temporal-flow-node[data-active='true'] {
    border-color: #2f6fed;
    box-shadow:
      0 0 0 3px rgba(47, 111, 237, 0.24),
      0 14px 30px rgba(23, 32, 38, 0.16);
  }

  .temporal-flow-node[data-muted='true'] {
    opacity: 0.38;
  }

  .node-kicker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
  }

  .node-kicker span:first-child,
  .node-source,
  .node-events {
    color: #5d6b75;
    font-size: 0.75rem;
  }

  .node-kicker span:first-child {
    text-transform: uppercase;
  }

  strong {
    font-size: 0.96rem;
    overflow-wrap: anywhere;
  }

  .node-source,
  .node-events {
    overflow-wrap: anywhere;
  }

  .node-events {
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
  }

  :global(.temporal-handle) {
    width: 0.55rem;
    height: 0.55rem;
    border: 2px solid #ffffff;
    background: #73838f;
  }
</style>
