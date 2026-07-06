<script lang="ts" module>
  import type { RuntimeOverlayState, TemporalGraphNode } from '$lib/graph/projection';

  export type TemporalFlowNodeData = Record<string, unknown> & {
    label: string;
    kind: TemporalGraphNode['kind'];
    state: RuntimeOverlayState;
    sourceText: string;
    eventSummary: string;
    active: boolean;
    muted: boolean;
    isContainer: boolean;
    /** For join markers: the kind of the region container they close, used to tint the join. */
    regionKind?: TemporalGraphNode['kind'] | undefined;
  };

  const MARKER_KINDS = new Set<TemporalGraphNode['kind']>([
    'decision',
    'parallel-fork',
    'join',
    'terminal',
  ]);

  // SVG polygon points (in the marker's fixed 208x76 viewBox) that paint the
  // decision rhombus and the parallel-fork hexagon. An SVG sibling — not a
  // `clip-path` on the box — is used so the shape keeps a continuous stroke: a
  // clip-path would clip the element's border away everywhere except the four
  // tangent points. The left/right vertices sit at the box's edge midpoints,
  // exactly where xyflow places the Left/Right connection handles.
  const MARKER_SHAPE_POINTS: Partial<Record<TemporalGraphNode['kind'], string>> = {
    decision: '104,3 205,38 104,73 3,38',
    'parallel-fork': '52,3 156,3 205,38 156,73 52,73 3,38',
  };
</script>

<script lang="ts">
  import { Badge } from '$cinder-components/badge';
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';

  import { runtimeStateToken } from '$lib/graph/projection';
  import { statusBadgeVariant } from '$lib/graph/runtime-display';

  let { data }: NodeProps = $props();
  const nodeData = $derived(data as TemporalFlowNodeData);
  const isMarker = $derived(MARKER_KINDS.has(nodeData.kind));
  const shapePoints = $derived(MARKER_SHAPE_POINTS[nodeData.kind]);
</script>

{#if nodeData.isContainer}
  <div
    class="region-container"
    data-kind={nodeData.kind}
    data-active={nodeData.active ? 'true' : undefined}
  >
    <span class="region-header">{nodeData.label}</span>
  </div>
{:else if isMarker}
  <div
    class="flow-marker"
    data-kind={nodeData.kind}
    data-active={nodeData.active ? 'true' : undefined}
    data-muted={nodeData.muted ? 'true' : undefined}
    data-terminal-kind={nodeData.kind === 'terminal' ? nodeData.label : undefined}
    data-region={nodeData.kind === 'join' ? nodeData.regionKind : undefined}
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
    {#if shapePoints}
      <svg class="marker-shape" viewBox="0 0 208 76" preserveAspectRatio="none" aria-hidden="true">
        <polygon points={shapePoints} />
      </svg>
    {/if}
    {#if nodeData.kind !== 'join'}
      <span class="marker-label" title={nodeData.label}>{nodeData.label}</span>
    {/if}
  </div>
{:else}
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
{/if}

<style>
  .temporal-flow-node {
    position: relative;
    display: grid;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-height: 6.4rem;
    padding: 0.75rem;
    /* Flat-card recipe shared with every other panel on the page; a heavy
       drop shadow reads as clutter once 10-30 cards are on screen at once. */
    border: 1px solid #d3dde5;
    border-left: 0.25rem solid #5f6f7a;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #172026;
    box-shadow: 0 1px 2px rgba(22, 32, 38, 0.05);
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

  .temporal-flow-node[data-kind='query'] {
    border-left-color: #a13d8f;
  }

  .temporal-flow-node[data-kind='update'] {
    border-left-color: #d9668a;
  }

  .temporal-flow-node[data-kind='child-workflow'],
  .temporal-flow-node[data-kind='external-workflow'] {
    border-left-color: #1f8fce;
  }

  .temporal-flow-node[data-kind='continue-as-new'] {
    border-left-color: #3f5b73;
  }

  .temporal-flow-node[data-kind='patch'] {
    border-left-color: #c98a1d;
  }

  .temporal-flow-node[data-kind='cancellation-scope'] {
    border-left-color: #8a98a3;
  }

  .temporal-flow-node[data-kind='dynamic'],
  .temporal-flow-node[data-kind='runtime'] {
    border-left-color: #7a4cc2;
  }

  .temporal-flow-node[data-active='true'] {
    border-color: #2f6fed;
    box-shadow:
      0 0 0 3px rgba(47, 111, 237, 0.24),
      0 4px 10px rgba(23, 32, 38, 0.1);
  }

  .temporal-flow-node[data-muted='true'] {
    opacity: 0.38;
  }

  /* Region containers: a solid group box with a full-width header band that
     fills the top padding ELK reserves (54px), reading as a deliberate frame
     rather than a dashed placeholder, while the pale body recedes behind its
     child nodes. */
  /* Region bodies are nearly opaque: a nested region (e.g. an IF inside a TRY) must
     read as its own tint rather than muddying into the parent's color underneath. */
  .region-container {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 100%;
    border: 1px solid #6a8fae;
    border-radius: 0.75rem;
    background: rgba(240, 244, 248, 0.92);
  }

  .region-container[data-kind='loop-region'] {
    border-color: #b78a3a;
    background: rgba(249, 242, 227, 0.92);
  }

  .region-container[data-kind='parallel-region'] {
    border-color: #4c8fb5;
    background: rgba(225, 239, 248, 0.92);
  }

  .region-container[data-kind='try-region'] {
    border-color: #b56a6a;
    background: rgba(250, 234, 234, 0.92);
  }

  .region-container[data-active='true'] {
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.18);
  }

  .region-header {
    position: absolute;
    inset: 0 0 auto 0;
    display: flex;
    align-items: center;
    height: 2.25rem;
    margin: 0;
    padding: 0 0.75rem;
    background: rgba(255, 255, 255, 0.68);
    border-bottom: 1px solid rgba(106, 143, 174, 0.4);
    color: #34434f;
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .region-container[data-kind='loop-region'] .region-header {
    border-bottom-color: rgba(183, 138, 58, 0.45);
  }

  .region-container[data-kind='parallel-region'] .region-header {
    border-bottom-color: rgba(76, 143, 181, 0.45);
  }

  .region-container[data-kind='try-region'] .region-header {
    border-bottom-color: rgba(181, 106, 106, 0.45);
  }

  /* Markers: decision diamonds, parallel-fork hexagons, join dots, terminal stadiums. */
  .flow-marker {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0.35rem 0.6rem;
    color: #172026;
    font-size: 0.8rem;
    font-weight: 600;
    text-align: center;
    transition: opacity 120ms ease;
  }

  .flow-marker[data-muted='true'] {
    opacity: 0.38;
  }

  /* The diamond/hexagon are painted by an absolutely-positioned SVG sibling so
     the marker box stays a plain rectangle that still hosts the connection
     handles; the viewBox is 1:1 with the ELK-fed 208x76 box. */
  .marker-shape {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* White fill (like the activity cards) so the diamond and its label stay legible
     against a region container's tinted body instead of blending into it. */
  .marker-shape polygon {
    fill: #ffffff;
    stroke: #5d6b75;
    stroke-width: 1.5;
  }

  .flow-marker[data-kind='parallel-fork'] .marker-shape polygon {
    fill: #dceef7;
    stroke: #4c8fb5;
  }

  .flow-marker[data-active='true'] .marker-shape polygon {
    fill: #eaf1ff;
    stroke: #2f6fed;
    stroke-width: 2;
  }

  .marker-label {
    position: relative;
    z-index: 1;
    padding-inline: 0.25rem;
  }

  /* The diamond/hexagon interiors are narrow; long condition labels truncate
     and stay fully readable via the title tooltip and the selection inspector. */
  .flow-marker[data-kind='decision'] .marker-label,
  .flow-marker[data-kind='parallel-fork'] .marker-label {
    max-width: 62%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flow-marker[data-kind='join'] {
    border: 1.5px solid #55636d;
    border-radius: 999px;
    background: #73838f;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  }

  /* The parallel join is tinted to its region's blue so it reads as the closing
     counterpart of the hexagon fork; branch/try joins stay neutral to match
     their neutral decision markers. The active-state rule below still wins. */
  .flow-marker[data-kind='join'][data-region='parallel-region'] {
    border-color: #3f82aa;
    background: #4c8fb5;
  }

  .flow-marker[data-kind='terminal'] {
    border: 1.5px solid #3f5b73;
    border-radius: 999px;
    background: #eef2f7;
  }

  .flow-marker[data-kind='terminal'][data-terminal-kind='throw'] {
    border-color: #c94444;
    background: #fdecec;
    color: #8b2626;
  }

  /* Only the bordered markers (join/terminal) get a focus ring; the diamond and
     hexagon carry their selection state through the SVG stroke rule above. */
  .flow-marker[data-kind='join'][data-active='true'] {
    border-color: #2f6fed;
    background: #2f6fed;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.22);
  }

  .flow-marker[data-kind='terminal'][data-active='true'] {
    border-color: #2f6fed;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.22);
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
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.03em;
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
