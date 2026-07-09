<script lang="ts">
  import LoopBackEdge from '$lib/components/loop-back-edge.svelte';
  import TemporalFlowNodeComponent, {
    type TemporalFlowNodeData,
  } from '$lib/components/temporal-flow-node.svelte';
  import WorkflowFlowToolbar from '$lib/components/workflow-flow-toolbar.svelte';
  import WorkflowSelectionInspector from '$lib/components/workflow-selection-inspector.svelte';
  import WorkflowSourcePanel from '$lib/components/workflow-source-panel.svelte';
  import WorkflowTimelinePanel from '$lib/components/workflow-timeline-panel.svelte';
  import {
    detailForSelection,
    selectionFromEdge,
    selectionFromNode,
    selectionFromTimelineRow,
    type WorkflowSelection,
  } from '$lib/components/workflow-selection';
  import {
    layoutGraph,
    terminateGraphLayoutWorker,
    type LayoutPositions,
    type LayoutStatus,
  } from '$lib/graph/layout';
  import {
    isStructuralNode,
    runtimeOverlayStates,
    runtimeStateToken,
    type GraphProjection,
    type RuntimeOverlayState,
    type TemporalGraphEdge,
    type TimelineRow,
  } from '$lib/graph/projection';
  import { compactEventSummary } from '$lib/graph/runtime-display';
  import { EmptyState } from '@lostgradient/cinder/empty-state';
  import {
    Background,
    BackgroundVariant,
    Controls,
    MarkerType,
    MiniMap,
    Position,
    SvelteFlow,
    type Edge,
    type Node,
  } from '@xyflow/svelte';
  import { onDestroy } from 'svelte';

  type TemporalFlowNode = Node<TemporalFlowNodeData, 'temporal'>;
  type TemporalFlowEdgeData = Record<string, unknown> & {
    state: RuntimeOverlayState;
    eventSummary: string;
    runtimeOperationIds: string[];
  };
  type TemporalFlowEdge = Edge<TemporalFlowEdgeData, 'smoothstep' | 'loopback'>;
  type Props = {
    graphProjection: GraphProjection | undefined;
    traceArtifactId: string | undefined;
  };

  const nodeTypes = { temporal: TemporalFlowNodeComponent };
  const edgeTypes = { loopback: LoopBackEdge };

  let { graphProjection, traceArtifactId }: Props = $props();
  let selection = $state<WorkflowSelection>({ kind: 'none' });
  let statusFilter = $state<RuntimeOverlayState | 'all'>('all');
  let layoutPositions = $state.raw<LayoutPositions>({});
  let layoutStatus = $state<LayoutStatus>('idle');
  let layoutError = $state<string | undefined>();
  let autoSelectedTraceArtifactId = $state<string | undefined>();
  let flowInstanceKey = $state(0);

  const selectionDetail = $derived(
    graphProjection ? detailForSelection(graphProjection, selection) : undefined,
  );
  const selectedGraphNodeId = $derived(selectionDetail?.node?.id);
  const selectedEdgeId = $derived(selectionDetail?.edge?.id);
  const selectedRuntimeOperationId = $derived(selectionDetail?.operation?.id);
  const visibleTimelineRows = $derived(
    graphProjection?.timelineRows.filter(shouldShowTimelineRow) ?? [],
  );
  const hasRuntime = $derived(Boolean(traceArtifactId));
  const visibleFilterStates = $derived(
    hasRuntime
      ? runtimeOverlayStates.filter((state) => (graphProjection?.statusCounts.get(state) ?? 0) > 0)
      : [],
  );
  const flowNodes = $derived(graphProjection?.nodes.map<TemporalFlowNode>(createFlowNode) ?? []);
  const flowEdges = $derived(graphProjection?.edges.map<TemporalFlowEdge>(createFlowEdge) ?? []);
  const filterableNodeCount = $derived(
    graphProjection
      ? [...graphProjection.statusCounts.values()].reduce((sum, count) => sum + count, 0)
      : 0,
  );
  const hasSelection = $derived(Boolean(selectionDetail));

  $effect(() => {
    const projection = graphProjection;

    if (!projection) {
      layoutPositions = {};
      layoutStatus = 'idle';
      layoutError = undefined;
      return;
    }

    let cancelled = false;
    layoutStatus = 'running';
    layoutError = undefined;

    void (async () => {
      try {
        const { positions } = await layoutGraph(projection.nodes, projection.edges);
        if (cancelled) return;
        layoutPositions = positions;
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

  $effect(() => {
    const projection = graphProjection;
    if (!projection || autoSelectedTraceArtifactId === traceArtifactId) return;

    const initialRow =
      projection.runtimeOperationRows.find((row) => row.operation.kind === 'activity') ??
      projection.runtimeOperationRows[0];

    selection = initialRow
      ? { kind: 'operation', operationId: initialRow.operation.id }
      : { kind: 'none' };
    autoSelectedTraceArtifactId = traceArtifactId;
  });

  onDestroy(terminateGraphLayoutWorker);

  $effect(() => {
    if (statusFilter !== 'all' && !visibleFilterStates.includes(statusFilter)) {
      statusFilter = 'all';
    }
  });

  function shouldShowTimelineRow(row: TimelineRow): boolean {
    return statusFilter === 'all' || row.state === statusFilter;
  }

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
    const muted = !structural && statusFilter !== 'all' && node.state !== statusFilter;
    const layout = layoutPositions[node.id];
    const regionKind = joinRegionKind(node);

    return {
      id: node.id,
      type: 'temporal',
      position: layout ? { x: layout.x, y: layout.y } : node.fallbackPosition,
      ...(node.parentId ? { parentId: node.parentId } : {}),
      ...(layout ? { width: layout.width, height: layout.height } : {}),
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
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

  function edgeRoutePresentation(edge: TemporalGraphEdge): {
    type: TemporalFlowEdge['type'];
    routeData: Partial<TemporalFlowEdgeData>;
  } {
    if (edge.variant === 'loop-back') return { type: 'loopback', routeData: {} };

    return { type: 'smoothstep', routeData: {} };
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
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2f5f67', width: 18, height: 18 },
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
    selection = selectionFromTimelineRow(row);
  }

  function selectGraphNode(nodeId: string): void {
    selection = selectionFromNode(graphProjection, nodeId);
  }

  function selectEdge(edgeId: string): void {
    selection = selectionFromEdge(edgeId);
  }

  function clearGraphSelection(): void {
    selection = { kind: 'none' };
  }

  function fitGraph(): void {
    flowInstanceKey += 1;
  }
</script>

{#if graphProjection}
  <section
    class="flow-workspace"
    class:with-selection={hasSelection}
    aria-label="Workflow graph and timeline"
  >
    <div class="flow-workbench">
      <WorkflowSourcePanel detail={selectionDetail} />

      <div class="flow-main-stack">
        <div class="flow-primary" class:has-selection={hasSelection}>
          <WorkflowFlowToolbar
            {traceArtifactId}
            {hasRuntime}
            {visibleFilterStates}
            bind:statusFilter
            {filterableNodeCount}
            statusCounts={graphProjection.statusCounts}
            {hasSelection}
            {fitGraph}
            {clearGraphSelection}
          />

          {#if layoutStatus === 'failed'}
            <div class="layout-warning" role="alert">Graph layout failed: {layoutError}</div>
          {/if}

          <div class="flow-stage" data-layout-status={layoutStatus}>
            {#if layoutStatus !== 'ready'}
              <div class="flow-placeholder" role="status">
                {layoutStatus === 'failed' ? 'Graph layout failed.' : 'Laying out graph…'}
              </div>
            {:else}
              {#key flowInstanceKey}
                <SvelteFlow
                  id="temporal-flow"
                  class="temporal-flow"
                  nodes={flowNodes}
                  edges={flowEdges}
                  {nodeTypes}
                  {edgeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.02, maxZoom: 1.8 }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable
                  minZoom={0.02}
                  maxZoom={2}
                  colorMode="light"
                  colorModeSSR="light"
                  onnodeclick={({ node }) => selectGraphNode(node.id)}
                  onedgeclick={({ edge }) => selectEdge(edge.id)}
                  aria-label="Workflow execution graph"
                >
                  <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
                  <MiniMap
                    ariaLabel="Workflow graph minimap"
                    width={136}
                    height={84}
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
              {/key}
            {/if}
          </div>
        </div>

        {#if hasRuntime}
          <div class="flow-timeline-dock">
            <WorkflowTimelinePanel
              rows={visibleTimelineRows}
              {selectedRuntimeOperationId}
              {selectTimelineRow}
            />
          </div>
        {/if}
      </div>

      {#if selectionDetail}
        <WorkflowSelectionInspector detail={selectionDetail} />
      {/if}
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
    min-width: 0;
  }

  .flow-workbench {
    display: grid;
    grid-template-columns: minmax(19rem, 21rem) minmax(0, 1fr) minmax(19rem, 21rem);
    gap: 0.75rem;
    align-items: start;
  }

  .flow-main-stack {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }

  .flow-primary {
    min-width: 0;
    border: 1px solid #b9c8ce;
    border-radius: 0.45rem;
    background:
      linear-gradient(90deg, rgba(15, 143, 131, 0.05) 1px, transparent 1px) 0 0 / 3rem 3rem,
      #ffffff;
    box-shadow: 0 12px 28px rgba(21, 32, 39, 0.07);
  }

  .layout-warning {
    margin: 0.75rem 0.95rem 0;
    padding: 0.75rem;
    border: 1px solid #e5b08d;
    border-radius: 0.4rem;
    background: #fff1f1;
    color: #8d351f;
    font-size: 0.875rem;
  }

  .flow-stage {
    height: clamp(31rem, calc(100vh - 17rem), 43rem);
    min-height: 31rem;
    overflow: hidden;
    border-radius: 0 0 0.45rem 0.45rem;
    background:
      linear-gradient(90deg, rgba(15, 143, 131, 0.08) 1px, transparent 1px) 0 0 / 4.5rem 4.5rem,
      linear-gradient(180deg, rgba(52, 104, 246, 0.05) 1px, transparent 1px) 0 0 / 4.5rem 4.5rem,
      #f8fbfb;
  }

  :global(.explorer-shell.embedded) .flow-stage {
    height: clamp(31rem, calc(100vh - 17rem), 43rem);
    min-height: 31rem;
  }

  .flow-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #62727a;
    font-size: 0.9rem;
  }

  :global(.temporal-flow) {
    --xy-background-pattern-dots-color-default: #a8babf;
    --xy-edge-stroke-default: #2f5f67;
    --xy-edge-stroke-width-default: 2.8;
    --xy-edge-stroke-selected-default: #3468f6;
    width: 100%;
    height: 100%;
  }

  :global(.temporal-flow .svelte-flow__edges),
  :global(.temporal-flow .svelte-flow__edge-wrapper) {
    z-index: 2;
    width: 100%;
    height: 100%;
  }

  :global(.temporal-flow .svelte-flow__edge-path) {
    stroke: #2f5f67;
    stroke-width: 3.2px;
    vector-effect: non-scaling-stroke;
  }

  :global(.temporal-flow .svelte-flow__edge.selected-flow-edge .svelte-flow__edge-path) {
    stroke: #3468f6;
    stroke-width: 3px;
  }

  :global(.temporal-flow .svelte-flow__edge-label) {
    padding: 0.1rem 0.4rem;
    border: 1px solid #c3d0d5;
    border-radius: 0.3rem;
    background: rgba(255, 255, 255, 0.92);
    color: #2d3d45;
    font-size: 0.75rem;
    font-weight: 650;
  }

  :global(.temporal-flow .svelte-flow__minimap) {
    border: 1px solid #b9c8ce;
    border-radius: 0.4rem;
    box-shadow: 0 8px 18px rgba(21, 32, 39, 0.1);
    overflow: hidden;
  }

  :global(.temporal-flow .svelte-flow__attribution) {
    display: none;
  }

  @media (max-width: 1280px) {
    .flow-workbench {
      grid-template-columns: minmax(18rem, 20rem) minmax(0, 1fr);
    }

    :global(.selection-inspector) {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 840px) {
    .flow-workbench {
      grid-template-columns: minmax(0, 1fr);
    }

    .flow-stage {
      height: 32rem;
    }
  }
</style>
