<script lang="ts">
  import LoopBackEdge from '$lib/components/loop-back-edge.svelte';
  import RoutedEdge from '$lib/components/routed-edge.svelte';
  import TemporalFlowNodeComponent, {
    type TemporalFlowNodeData,
  } from '$lib/components/temporal-flow-node.svelte';
  import WorkflowEdgePanel from '$lib/components/workflow-edge-panel.svelte';
  import WorkflowSelectionInspector from '$lib/components/workflow-selection-inspector.svelte';
  import WorkflowTimelinePanel from '$lib/components/workflow-timeline-panel.svelte';
  import {
    layoutGraph,
    terminateGraphLayoutWorker,
    type EdgeRoutes,
    type LayoutPoint,
    type LayoutPositions,
    type LayoutStatus,
  } from '$lib/graph/layout';
  import {
    isStructuralNode,
    runtimeOverlayStates,
    runtimeStateToken,
    sourceText,
    type GraphProjection,
    type RuntimeOverlayState,
    type TemporalGraphEdge,
    type TimelineRow,
  } from '$lib/graph/projection';
  import { compactEventSummary, operationDisplayName } from '$lib/graph/runtime-display';
  import { Button } from '@lostgradient/cinder/button';
  import { EmptyState } from '@lostgradient/cinder/empty-state';
  import { Popover } from '@lostgradient/cinder/popover';
  import { Segment } from '@lostgradient/cinder/segment';
  import { SegmentedControl } from '@lostgradient/cinder/segmented-control';
  import {
    Background,
    BackgroundVariant,
    Controls,
    MarkerType,
    MiniMap,
    SvelteFlow,
    type Edge,
    type Node,
  } from '@xyflow/svelte';
  import { Info, MousePointer2 } from 'lucide-svelte';
  import { onDestroy } from 'svelte';

  type TemporalFlowNode = Node<TemporalFlowNodeData, 'temporal'>;
  type TemporalFlowEdgeData = Record<string, unknown> & {
    state: RuntimeOverlayState;
    eventSummary: string;
    runtimeOperationIds: string[];
    routePoints?: LayoutPoint[];
    routeLabelX?: number;
    routeLabelY?: number;
  };
  type TemporalFlowEdge = Edge<TemporalFlowEdgeData, 'smoothstep' | 'loopback' | 'routed'>;
  type Props = {
    graphProjection: GraphProjection | undefined;
    traceArtifactId: string | undefined;
  };

  const nodeTypes = { temporal: TemporalFlowNodeComponent };
  const edgeTypes = { loopback: LoopBackEdge, routed: RoutedEdge };

  let { graphProjection, traceArtifactId }: Props = $props();
  let selectedRuntimeOperationId = $state<string | undefined>();
  let selectedGraphNodeId = $state<string | undefined>();
  let selectedEdgeId = $state<string | undefined>();
  let statusFilter = $state<RuntimeOverlayState | 'all'>('all');
  let legendOpen = $state(false);
  let layoutPositions = $state.raw<LayoutPositions>({});
  let layoutEdgeRoutes = $state.raw<EdgeRoutes>({});
  let layoutStatus = $state<LayoutStatus>('idle');
  let layoutError = $state<string | undefined>();

  const selectedGraphNode = $derived(
    selectedGraphNodeId ? graphProjection?.nodesById.get(selectedGraphNodeId) : undefined,
  );
  const selectedEdge = $derived(
    selectedEdgeId ? graphProjection?.edgesById.get(selectedEdgeId) : undefined,
  );
  const selectedRuntimeOperation = $derived(
    selectedRuntimeOperationId
      ? graphProjection?.operationsById.get(selectedRuntimeOperationId)
      : undefined,
  );
  const selectedOperationRow = $derived(
    selectedRuntimeOperationId
      ? graphProjection?.runtimeOperationRows.find(
          (row) => row.operation.id === selectedRuntimeOperationId,
        )
      : undefined,
  );
  const selectedMapping = $derived(
    selectedRuntimeOperationId
      ? graphProjection?.mappingsByRuntimeOperationId.get(selectedRuntimeOperationId)
      : undefined,
  );
  const visibleTimelineRows = $derived(
    graphProjection?.timelineRows.filter(shouldShowTimelineRow) ?? [],
  );
  // Runtime evidence is progressive enhancement: without a trace the flow view is a
  // pure static-analysis projection, so the runtime-state filter chips and the timeline
  // are suppressed entirely rather than shown as a row of zeroes.
  const hasRuntime = $derived(Boolean(traceArtifactId));
  // Only surface chips for states the execution actually produced, so a workflow that
  // only completed activities shows two chips, not thirteen mostly-zero ones.
  const visibleFilterStates = $derived(
    hasRuntime
      ? runtimeOverlayStates.filter((state) => (graphProjection?.statusCounts.get(state) ?? 0) > 0)
      : [],
  );
  const flowNodes = $derived(graphProjection?.nodes.map<TemporalFlowNode>(createFlowNode) ?? []);
  const flowEdges = $derived(graphProjection?.edges.map<TemporalFlowEdge>(createFlowEdge) ?? []);
  // Structural nodes are excluded from status counts, so the "All" total sums the per-state counts.
  const filterableNodeCount = $derived(
    graphProjection
      ? [...graphProjection.statusCounts.values()].reduce((sum, count) => sum + count, 0)
      : 0,
  );
  const activeInspectorTitle = $derived(
    selectedEdge?.label ??
      (selectedRuntimeOperation ? operationDisplayName(selectedRuntimeOperation) : undefined) ??
      selectedGraphNode?.label ??
      'No selection',
  );
  const activeInspectorState = $derived(
    selectedEdge?.state ?? selectedOperationRow?.state ?? selectedGraphNode?.state,
  );
  const activeInspectorSource = $derived(
    selectedEdge
      ? (graphProjection?.nodesById.get(selectedEdge.target)?.sourceText ?? 'not resolved')
      : (selectedOperationRow?.sourceText ??
          selectedGraphNode?.sourceText ??
          sourceText(undefined)),
  );
  const activeInspectorEventReferences = $derived(
    selectedEdge?.eventReferences ??
      selectedRuntimeOperation?.eventReferences ??
      selectedGraphNode?.eventReferences ??
      [],
  );
  const activeInspectorReason = $derived(
    selectedEdge ? 'Directed static execution order.' : selectedMapping?.reason,
  );

  $effect(() => {
    const projection = graphProjection;

    if (!projection) {
      layoutPositions = {};
      layoutEdgeRoutes = {};
      layoutStatus = 'idle';
      layoutError = undefined;
      return;
    }

    let cancelled = false;
    layoutStatus = 'running';
    layoutError = undefined;

    void (async () => {
      try {
        const { positions, edgeRoutes } = await layoutGraph(projection.nodes, projection.edges);
        if (cancelled) return;
        layoutPositions = positions;
        layoutEdgeRoutes = edgeRoutes;
        layoutStatus = 'ready';
      } catch (error) {
        if (cancelled) return;
        layoutError = error instanceof Error ? error.message : String(error);
        layoutStatus = 'failed';
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  onDestroy(terminateGraphLayoutWorker);

  // If the active filter is no longer among the visible states (trace cleared, or a
  // different workflow selected in aggregate mode), fall back to "all" so nodes are
  // never left muted by a filter the user can no longer see or clear.
  $effect(() => {
    if (statusFilter !== 'all' && !visibleFilterStates.includes(statusFilter)) {
      statusFilter = 'all';
    }
  });

  function shouldShowTimelineRow(row: TimelineRow): boolean {
    return (
      (!selectedGraphNodeId || row.graphNodeId === selectedGraphNodeId) &&
      (statusFilter === 'all' || row.state === statusFilter)
    );
  }

  // A join marker is tinted to the region it closes (e.g. the parallel join
  // matches its fork), so surface the enclosing region container's kind.
  function joinRegionKind(
    node: GraphProjection['nodes'][number],
  ): GraphProjection['nodes'][number]['kind'] | undefined {
    if (node.kind !== 'join' || !node.parentId) return undefined;
    return graphProjection?.nodesById.get(node.parentId)?.kind;
  }

  function createFlowNode(node: GraphProjection['nodes'][number]): TemporalFlowNode {
    const structural = isStructuralNode(node);
    const active =
      node.id === selectedGraphNodeId ||
      Boolean(
        selectedRuntimeOperationId && node.runtimeOperationIds.includes(selectedRuntimeOperationId),
      );
    // Structural nodes (containers/markers) carry no runtime state, so the status filter never hides them.
    const muted = !structural && statusFilter !== 'all' && node.state !== statusFilter;
    const layout = layoutPositions[node.id];
    const regionKind = joinRegionKind(node);

    return {
      id: node.id,
      type: 'temporal',
      position: layout ? { x: layout.x, y: layout.y } : node.fallbackPosition,
      ...(node.parentId ? { parentId: node.parentId } : {}),
      ...(layout ? { width: layout.width, height: layout.height } : {}),
      data: {
        label: node.label,
        kind: node.kind,
        state: node.state,
        sourceText: node.sourceText,
        eventSummary: compactEventSummary(node.eventReferences),
        active,
        muted,
        isContainer: Boolean(node.isContainer),
        regionKind,
      },
      draggable: false,
      focusable: true,
      selected: active,
      hidden: muted,
      ariaRole: 'group',
      domAttributes: {
        'data-flow-node-id': node.id,
      },
    };
  }

  // Loop-back edges keep their hand-drawn downward arc. Every other edge follows ELK's
  // computed orthogonal route (once layout resolves) so it stays inside the region
  // containers ELK routed it around; before layout, it falls back to smoothstep.
  function edgeRoutePresentation(edge: TemporalGraphEdge): {
    type: TemporalFlowEdge['type'];
    routeData: Partial<TemporalFlowEdgeData>;
  } {
    if (edge.variant === 'loop-back') return { type: 'loopback', routeData: {} };

    const route = layoutEdgeRoutes[edge.id];
    if (!route) return { type: 'smoothstep', routeData: {} };

    return {
      type: 'routed',
      routeData: {
        routePoints: route.points,
        routeLabelX: route.labelX,
        routeLabelY: route.labelY,
      },
    };
  }

  function createFlowEdge(edge: TemporalGraphEdge): TemporalFlowEdge {
    const active =
      edge.id === selectedEdgeId ||
      Boolean(selectedGraphNodeId && edge.target === selectedGraphNodeId);
    const muted =
      statusFilter !== 'all' &&
      (edge.state !== statusFilter || !graphProjection?.nodesById.has(edge.target));
    const { type, routeData } = edgeRoutePresentation(edge);

    return {
      id: edge.id,
      type,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: active,
      hidden: muted,
      focusable: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#475569', width: 20, height: 20 },
      data: {
        state: edge.state,
        eventSummary: compactEventSummary(edge.eventReferences),
        runtimeOperationIds: edge.runtimeOperationIds,
        ...routeData,
      },
      class: active ? 'selected-flow-edge' : undefined,
      domAttributes: {
        'data-flow-edge-id': edge.id,
      },
    };
  }

  function selectTimelineRow(row: TimelineRow): void {
    selectedRuntimeOperationId = row.entry.operationId;
    selectedGraphNodeId = row.graphNodeId;
    selectedEdgeId = undefined;
  }

  function selectGraphNode(nodeId: string): void {
    const node = graphProjection?.nodesById.get(nodeId);
    selectedGraphNodeId = nodeId;
    selectedRuntimeOperationId = node?.runtimeOperationIds[0];
    selectedEdgeId = undefined;
  }

  function selectEdge(edgeId: string): void {
    const edge = graphProjection?.edgesById.get(edgeId);
    selectedEdgeId = edgeId;
    selectedGraphNodeId = edge?.target;
    selectedRuntimeOperationId = edge?.runtimeOperationIds[0];
  }

  function clearGraphSelection(): void {
    selectedGraphNodeId = undefined;
    selectedRuntimeOperationId = undefined;
    selectedEdgeId = undefined;
  }

  function handleNodeClick({ node }: { node: TemporalFlowNode }): void {
    selectGraphNode(node.id);
  }

  function handleEdgeClick({ edge }: { edge: TemporalFlowEdge }): void {
    selectEdge(edge.id);
  }
</script>

{#if graphProjection}
  <section class="flow-workspace" aria-label="Workflow graph and timeline">
    <div class="flow-primary">
      <div class="flow-toolbar">
        <div>
          <h2>Flow projection</h2>
          <span>{traceArtifactId ?? 'static analysis only'}</span>
        </div>
        <div class="toolbar-actions">
          <Button variant="secondary" size="sm" onclick={clearGraphSelection}>
            <MousePointer2 size={15} aria-hidden="true" />
            Clear
          </Button>
          <Popover
            bind:open={legendOpen}
            label="Runtime state legend"
            placement="bottom-end"
            focusManagement="preserve"
          >
            {#snippet trigger()}
              <Button variant="secondary" size="sm">
                <Info size={15} aria-hidden="true" />
                States
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

      {#if hasRuntime && visibleFilterStates.length > 0}
        <SegmentedControl
          id="runtime-state-filters"
          bind:value={statusFilter}
          label="Runtime state filters"
          density="toolbar"
          detached
          fullWidth
          class="state-filters"
        >
          <Segment value="all">
            All
            <span class="filter-count">{filterableNodeCount}</span>
          </Segment>
          {#each visibleFilterStates as state (state)}
            <Segment value={state} data-state={runtimeStateToken(state)}>
              {state}
              <span class="filter-count">{graphProjection.statusCounts.get(state) ?? 0}</span>
            </Segment>
          {/each}
        </SegmentedControl>
      {/if}

      {#if layoutStatus === 'failed'}
        <div class="layout-warning" role="alert">Graph layout failed: {layoutError}</div>
      {/if}

      <div class="flow-stage" data-layout-status={layoutStatus}>
        {#if layoutStatus !== 'ready'}
          <!-- Mounting SvelteFlow only once ELK positions exist lets `fitView` fit
               the real layout on mount; fitting against fallback positions leaves
               the graph parked off-viewport when the async layout lands. -->
          <div class="flow-placeholder" role="status">
            {layoutStatus === 'failed' ? 'Graph layout failed.' : 'Laying out graph…'}
          </div>
        {:else}
          <SvelteFlow
            id="temporal-flow"
            class="temporal-flow"
            nodes={flowNodes}
            edges={flowEdges}
            {nodeTypes}
            {edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.22, maxZoom: 1.1 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            minZoom={0.02}
            maxZoom={1.45}
            colorMode="light"
            colorModeSSR="light"
            onnodeclick={handleNodeClick}
            onedgeclick={handleEdgeClick}
            aria-label="Workflow execution graph"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <MiniMap
              ariaLabel="Workflow graph minimap"
              width={220}
              height={150}
              bgColor="#f7f9fb"
              maskColor="rgba(23, 32, 38, 0.06)"
              nodeColor="#b7c6d1"
              nodeStrokeColor="#ffffff"
              nodeBorderRadius={6}
              pannable
              zoomable
            />
            <Controls showLock={false} />
          </SvelteFlow>
        {/if}
      </div>
    </div>

    <div class="flow-sidecar">
      {#if hasRuntime}
        <WorkflowTimelinePanel
          rows={visibleTimelineRows}
          {selectedRuntimeOperationId}
          {selectTimelineRow}
        />
      {/if}
      <WorkflowEdgePanel edges={graphProjection.edges} {selectedEdgeId} {selectEdge} />
      <WorkflowSelectionInspector
        title={activeInspectorTitle}
        state={activeInspectorState}
        source={activeInspectorSource}
        eventReferences={activeInspectorEventReferences}
        reason={activeInspectorReason}
        operation={selectedRuntimeOperation}
      />
    </div>
  </section>
{:else}
  <EmptyState
    title="No graph projection"
    description="Generate an analysis artifact before opening the explorer."
    headingLevel={2}
  />
{/if}

<style>
  .flow-workspace {
    display: grid;
    grid-template-columns: minmax(31rem, 1fr) minmax(20rem, 26rem);
    gap: 1rem;
    align-items: start;
  }

  .flow-primary,
  .flow-sidecar {
    min-width: 0;
  }

  .flow-primary {
    border: 1px solid #d3dde5;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(22, 32, 38, 0.05);
  }

  .flow-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid #dde5eb;
  }

  .flow-toolbar h2 {
    margin: 0;
    font-size: 0.88rem;
  }

  .flow-toolbar span {
    color: #5d6b75;
    font-size: 0.75rem;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  :global(.state-filters) {
    padding: 0.5rem 0.75rem;
    overflow-x: auto;
    border-bottom: 1px solid #dde5eb;
  }

  :global(.state-filters .cinder-segmented-control-option) {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  :global(.state-filters .filter-count) {
    color: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    opacity: 0.78;
  }

  :global(.state-filters [data-state]::before) {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #8a98a3;
  }

  :global(.state-filters [data-state='completed']::before),
  :global(.state-filters [data-state='observed']::before),
  :global(.state-filters [data-state='fired']::before) {
    background: #18845b;
  }

  :global(.state-filters [data-state='failed']::before),
  :global(.state-filters [data-state='timed-out']::before),
  :global(.state-filters [data-state='canceled']::before) {
    background: #c94444;
  }

  :global(.state-filters [data-state='retried']::before),
  :global(.state-filters [data-state='pending']::before),
  :global(.state-filters [data-state='ambiguous']::before) {
    background: #b76b00;
  }

  :global(.state-filters [data-state='unmapped']::before) {
    background: #7a4cc2;
  }

  :global(.state-filters .filter-count) {
    display: inline-grid;
    place-items: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    /* A hair darker than the chip so the count reads as its own badge, not floating text. */
    background: #e7edf2;
    color: #172026;
    font-size: 0.75rem;
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
    color: #34434f;
    font-size: 0.8125rem;
  }

  .state-legend span::before {
    content: '';
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
    background: #8a98a3;
  }

  .state-legend span[data-state='completed']::before,
  .state-legend span[data-state='observed']::before,
  .state-legend span[data-state='fired']::before {
    background: #18845b;
  }

  .state-legend span[data-state='failed']::before,
  .state-legend span[data-state='timed-out']::before,
  .state-legend span[data-state='canceled']::before {
    background: #c94444;
  }

  .state-legend span[data-state='retried']::before,
  .state-legend span[data-state='pending']::before,
  .state-legend span[data-state='ambiguous']::before {
    background: #b76b00;
  }

  .state-legend span[data-state='unmapped']::before {
    background: #7a4cc2;
  }

  .layout-warning {
    margin: 0.75rem 0.95rem 0;
    padding: 0.75rem;
    border: 1px solid #e6b4b4;
    border-radius: 0.5rem;
    background: #fff1f1;
    color: #8b2626;
    font-size: 0.875rem;
  }

  .flow-stage {
    height: min(68vh, 42rem);
    min-height: 30rem;
    overflow: hidden;
    border-radius: 0 0 0.5rem 0.5rem;
  }

  :global(.explorer-shell.embedded) .flow-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  :global(.explorer-shell.embedded) .flow-stage {
    height: clamp(42rem, calc(100vh - 8.5rem), 64rem);
    min-height: 38rem;
  }

  :global(.explorer-shell.embedded) .flow-sidecar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .flow-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #5d6b75;
    font-size: 0.9rem;
  }

  :global(.temporal-flow) {
    --xy-background-pattern-dots-color-default: #b7c6d1;
    --xy-edge-stroke-default: #475569;
    --xy-edge-stroke-width-default: 2;
    --xy-edge-stroke-selected-default: #2f6fed;
    width: 100%;
    height: 100%;
  }

  /* xyflow-svelte renders each edge in its own `<svg class="svelte-flow__edge-wrapper">`
     that it never sizes, relying on `overflow: visible` to paint the path outside a
     zero-width viewport. Chromium does not paint SVG content when the viewport width
     is 0, so every edge is laid out (correct geometry) but never painted — the graph
     reads as disconnected nodes. Giving the edge layer and each wrapper a real size
     makes the paths paint. */
  :global(.temporal-flow .svelte-flow__edges),
  :global(.temporal-flow .svelte-flow__edge-wrapper) {
    width: 100%;
    height: 100%;
  }

  /* xyflow-svelte does not set a non-scaling stroke on edge paths, so an edge's
     stroke-width is expressed in flow coordinates and shrinks with the viewport
     zoom. A graph wide enough for `fitView` to zoom out (e.g. below ~0.7) then
     renders its edges sub-pixel and effectively invisible, which reads as a
     disconnected set of nodes. Pinning the stroke to screen pixels keeps every
     edge legible at any zoom. */
  :global(.temporal-flow .svelte-flow__edge-path) {
    vector-effect: non-scaling-stroke;
  }

  :global(.temporal-flow .svelte-flow__edge.selected-flow-edge .svelte-flow__edge-path) {
    stroke: #2f6fed;
    stroke-width: 2.4;
  }

  :global(.temporal-flow .svelte-flow__edge-label) {
    padding: 0.1rem 0.4rem;
    border: 1px solid #d7e0e6;
    border-radius: 0.35rem;
    background: rgba(255, 255, 255, 0.92);
    color: #34434f;
    font-size: 0.75rem;
    font-weight: 650;
  }

  :global(.temporal-flow .svelte-flow__minimap) {
    border: 1px solid #d3dde5;
    border-radius: 0.5rem;
    box-shadow: 0 1px 2px rgba(22, 32, 38, 0.05);
    overflow: hidden;
  }

  :global(.temporal-flow .svelte-flow__attribution) {
    display: none;
  }

  .flow-sidecar {
    display: grid;
    gap: 1rem;
  }

  @media (max-width: 1180px) {
    .flow-workspace {
      grid-template-columns: 1fr;
    }

    .flow-sidecar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 840px) {
    .flow-sidecar {
      grid-template-columns: 1fr;
    }

    :global(.explorer-shell.embedded) .flow-sidecar {
      grid-template-columns: 1fr;
    }

    .flow-stage {
      height: 32rem;
    }

    :global(.explorer-shell.embedded) .flow-stage {
      height: 34rem;
      min-height: 28rem;
    }
  }
</style>
