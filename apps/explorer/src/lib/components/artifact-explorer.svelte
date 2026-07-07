<script lang="ts">
  import WorkflowFlowPanel from '$lib/components/workflow-flow-panel.svelte';
  import WorkflowMessagesPanel from '$lib/components/workflow-messages-panel.svelte';
  import {
    defaultWorkflowId as selectDefaultWorkflowId,
    overlaysForWorkflow,
    traceMatchesRequest,
  } from '$lib/components/artifact-selection';
  import { buildGraphProjection, formatEventReferences, sourceText } from '$lib/graph/projection';
  import {
    formatDuration,
    formatTimestamp,
    operationDisplayName,
    operationKindLabel,
    statusBadgeVariant,
  } from '$lib/graph/runtime-display';
  import { Badge } from '$cinder-components/badge';
  import { Card } from '$cinder-components/card';
  import { DescriptionList } from '$cinder-components/description-list';
  import { EmptyState } from '$cinder-components/empty-state';
  import { SideNavigation } from '$cinder-components/side-navigation';
  import { SideNavigationItem } from '$cinder-components/side-navigation-item';
  import { Sidebar } from '$cinder-components/sidebar';
  import { Tab } from '$cinder-components/tab';
  import { TabList } from '$cinder-components/tab-list';
  import { TabPanel } from '$cinder-components/tab-panel';
  import { Table } from '$cinder-components/table';
  import { TableBody } from '$cinder-components/table-body';
  import { TableCell } from '$cinder-components/table-cell';
  import { TableHeader } from '$cinder-components/table-header';
  import { TableHeaderCell } from '$cinder-components/table-header-cell';
  import { TableRow } from '$cinder-components/table-row';
  import { Tabs } from '$cinder-components/tabs';
  import {
    Activity,
    AlertTriangle,
    Braces,
    FileText,
    GitBranch,
    History,
    MessageSquare,
    Route,
  } from 'lucide-svelte';

  import type { ExplorerArtifacts } from '@temporal-explorer/schemas';

  type Workflow = ExplorerArtifacts['analysis']['workflows'][number];
  type RuntimeOperation = ExplorerArtifacts['traces'][number]['operations'][number];
  type ActivityOperation = Extract<RuntimeOperation, { kind: 'activity' }>;

  const pageDescription =
    'See what a Temporal TypeScript Workflow can do and what it actually did: static ' +
    'control-flow graphs overlaid with real Event History runtime evidence.';

  let {
    artifacts,
    embedded = false,
    requestedTrace,
    siteUrl,
  }: {
    artifacts: ExplorerArtifacts;
    embedded?: boolean;
    requestedTrace?: string | undefined;
    siteUrl?: string | undefined;
  } = $props();
  let selectedWorkflowOverride = $state<string | undefined>();
  let activeTab = $state('flow');

  // Default to the workflow the requested trace actually ran, so a project with several
  // workflows (a parent plus its children) opens on the one being inspected rather than
  // whichever happens to be first — which can be a trivial child that renders as a lone node.
  const defaultWorkflowId = $derived(selectDefaultWorkflowId(artifacts, requestedTrace));
  // Select by the unique workflow id, not the display name: versioned workflows
  // can share a registered name, so a name would not identify a single one.
  const selectedWorkflowId = $derived(selectedWorkflowOverride ?? defaultWorkflowId);
  const selectedWorkflow = $derived.by(() => {
    return (
      artifacts.analysis.workflows.find((workflow) => workflow.id === selectedWorkflowId) ??
      artifacts.analysis.workflows[0]
    );
  });
  const selectedTrace = $derived.by(() => {
    const workflowTraces = artifacts.traces.filter(
      (trace) => trace.execution.workflowType === selectedWorkflow?.name,
    );

    if (requestedTrace) {
      const matchedTrace = workflowTraces.find((trace) =>
        traceMatchesRequest(trace, requestedTrace),
      );

      if (matchedTrace) {
        return matchedTrace;
      }
    }

    return workflowTraces[0];
  });
  const selectedOverlay = $derived.by(() => {
    const workflowOverlays = overlaysForWorkflow(artifacts, selectedWorkflow);

    if (selectedTrace) {
      return (
        workflowOverlays.find((overlay) => overlay.runtimeTraceId === selectedTrace.artifactId) ??
        workflowOverlays[0]
      );
    }

    return workflowOverlays[0];
  });
  const graphProjection = $derived.by(() => {
    if (!selectedWorkflow) {
      return undefined;
    }

    return buildGraphProjection({
      workflow: selectedWorkflow,
      trace: selectedTrace,
      overlay: selectedOverlay,
    });
  });
  const activityCommands = $derived(
    selectedWorkflow?.temporalCommands.filter((command) => command.kind === 'activity') ?? [],
  );
  const activityOperations = $derived(selectedTrace?.operations.filter(isActivityOperation) ?? []);
  // A static-analysis fact worth surfacing in the baseline signal strip, alongside
  // Activities and Diagnostics, so the strip stays meaningful before any trace loads.
  const messageSurfaceCount = $derived(
    (selectedWorkflow?.messageSurface.signals.length ?? 0) +
      (selectedWorkflow?.messageSurface.queries.length ?? 0) +
      (selectedWorkflow?.messageSurface.updates.length ?? 0),
  );
  const diagnostics = $derived([
    ...(selectedWorkflow?.diagnostics ?? []),
    ...(selectedTrace?.diagnostics ?? []),
    ...(selectedOverlay?.diagnostics ?? []),
  ]);
  const observedActivityNames = $derived(
    new Set(
      selectedOverlay?.staticNodes
        .filter((node) => node.kind === 'activity' && node.observed)
        .map((node) => node.name) ?? [],
    ),
  );
  const workflowEventReferences = $derived(
    selectedWorkflow
      ? (graphProjection?.nodesById.get(selectedWorkflow.id)?.eventReferences ?? [])
      : [],
  );

  function isActivityOperation(operation: RuntimeOperation): operation is ActivityOperation {
    return operation.kind === 'activity';
  }

  function workflowSignature(workflow: Workflow): string {
    const args = workflow.signature.args
      .map((argument) => `${argument.displayName ?? 'argument'}: ${argument.display}`)
      .join(', ');

    return `${workflow.name}(${args}): ${workflow.signature.result.display}`;
  }

  function workflowSignatureArguments(workflow: Workflow): Workflow['signature']['args'] {
    return workflow.signature.args;
  }

  function selectWorkflow(workflowId: string): void {
    selectedWorkflowOverride = workflowId;
    activeTab = 'flow';
  }
</script>

<svelte:head>
  <title>Temporal Workflow Explorer</title>
  <meta name="description" content={pageDescription} />
  <meta property="og:title" content="Temporal Workflow Explorer" />
  <meta property="og:description" content={pageDescription} />
  <meta property="og:type" content="website" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta
    property="og:image:alt"
    content="The Temporal Workflow Explorer showing a control-flow graph with runtime overlay"
  />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Temporal Workflow Explorer" />
  <meta name="twitter:description" content={pageDescription} />
  {#if siteUrl}
    <meta property="og:url" content={siteUrl} />
    <meta property="og:image" content={`${siteUrl}/og.png`} />
    <meta name="twitter:image" content={`${siteUrl}/og.png`} />
  {/if}
</svelte:head>

<div class="explorer-shell" class:embedded>
  {#if !embedded}
    <Sidebar label="Workflow artifacts" class="workflow-sidebar">
      {#snippet brand()}
        <div class="brand-lockup">
          <span class="brand-mark">TE</span>
          <div>
            <p>Temporal Explorer</p>
            <span>{artifacts.projectName}</span>
          </div>
        </div>
      {/snippet}

      {#snippet navigation()}
        <SideNavigation ariaLabel="Workflow selection">
          {#each artifacts.analysis.workflows as workflow (workflow.id)}
            <SideNavigationItem
              active={workflow.id === selectedWorkflow?.id}
              current="true"
              onclick={() => selectWorkflow(workflow.id)}
            >
              <span class="workflow-nav-item">{workflow.name}</span>
            </SideNavigationItem>
          {/each}
        </SideNavigation>
      {/snippet}

      {#snippet footer()}
        <div class="artifact-footer">
          <span>{artifacts.artifactDirectory}</span>
          <Badge variant="info" size="sm">{artifacts.analysis.schemaVersion}</Badge>
        </div>
      {/snippet}
    </Sidebar>
  {/if}

  <main class="workspace" aria-labelledby="workflow-title">
    {#if selectedWorkflow}
      <section class="workflow-header">
        <div>
          <p class="eyebrow">Workflow artifact</p>
          <h1 id="workflow-title">{selectedWorkflow.name}</h1>
          <code class="signature" aria-label={workflowSignature(selectedWorkflow)}>
            <span class="syntax-function">{selectedWorkflow.name}</span><span
              class="syntax-punctuation">(</span
            >{#each workflowSignatureArguments(selectedWorkflow) as argument, index (argument.id)}
              {#if index > 0}<span class="syntax-punctuation">, </span>{/if}<span
                class="syntax-identifier">{argument.displayName ?? 'argument'}</span
              ><span class="syntax-punctuation">: </span><span class="syntax-type"
                >{argument.display}</span
              >
            {/each}<span class="syntax-punctuation">): </span><span class="syntax-type"
              >{selectedWorkflow.signature.result.display}</span
            >
          </code>
        </div>
        {#if embedded && artifacts.analysis.workflows.length > 1}
          <label class="workflow-switcher">
            <span>Workflow</span>
            <select
              value={selectedWorkflowId}
              onchange={(event) => selectWorkflow(event.currentTarget.value)}
            >
              {#each artifacts.analysis.workflows as workflow (workflow.id)}
                <option value={workflow.id}>{workflow.name}</option>
              {/each}
            </select>
          </label>
        {/if}
      </section>

      <section class="signal-strip" aria-label="Artifact summary">
        <div>
          <span>Activities</span>
          <strong>{activityCommands.length}</strong>
        </div>
        <div>
          <span>Messages</span>
          <strong>{messageSurfaceCount}</strong>
        </div>
        {#if selectedTrace}
          <div>
            <span>Observed</span>
            <strong>{selectedOverlay?.coverage.activities.observed ?? 0}</strong>
          </div>
          <div>
            <span>Runtime status</span>
            <strong>{selectedTrace.execution.status}</strong>
          </div>
        {/if}
        <div>
          <span>Diagnostics</span>
          <strong>{diagnostics.length}</strong>
        </div>
      </section>

      <Tabs bind:value={activeTab} class="detail-tabs">
        <TabList label="Workflow detail views">
          <Tab value="flow"><GitBranch size={15} aria-hidden="true" />Flow</Tab>
          <Tab value="history"><History size={15} aria-hidden="true" />History</Tab>
          <Tab value="trace"><Route size={15} aria-hidden="true" />Trace</Tab>
          <Tab value="overview"><FileText size={15} aria-hidden="true" />Overview</Tab>
          <Tab value="messages"><MessageSquare size={15} aria-hidden="true" />Messages</Tab>
          <Tab value="activities"><Activity size={15} aria-hidden="true" />Activities</Tab>
          <Tab value="types"><Braces size={15} aria-hidden="true" />Types</Tab>
          <Tab value="diagnostics">
            <AlertTriangle size={15} aria-hidden="true" />
            Diagnostics
          </Tab>
        </TabList>

        <TabPanel value="flow">
          <WorkflowFlowPanel {graphProjection} traceArtifactId={selectedTrace?.artifactId} />
        </TabPanel>

        <TabPanel value="history">
          {#if graphProjection && graphProjection.timelineRows.length > 0}
            <div class="table-panel">
              <Table caption="History timeline" density="condensed">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Time</TableHeaderCell>
                    <TableHeaderCell>Operation</TableHeaderCell>
                    <TableHeaderCell>State</TableHeaderCell>
                    <TableHeaderCell>Source</TableHeaderCell>
                    <TableHeaderCell>Events</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {#each graphProjection.timelineRows as row (row.id)}
                    <TableRow>
                      <TableCell>{formatTimestamp(row.entry.at)}</TableCell>
                      <TableCell as="th">{row.entry.label}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.state)} size="sm">
                          {row.state}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.sourceText}</TableCell>
                      <TableCell>{row.entry.eventIds.join(', ')}</TableCell>
                    </TableRow>
                  {/each}
                </TableBody>
              </Table>
            </div>
          {:else}
            <EmptyState title="No imported history" headingLevel={2} />
          {/if}
        </TabPanel>

        <TabPanel value="trace">
          {#if graphProjection && graphProjection.runtimeOperationRows.length > 0}
            <div class="table-panel">
              <Table caption="Runtime operations" density="condensed">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Kind</TableHeaderCell>
                    <TableHeaderCell>Operation</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Source</TableHeaderCell>
                    <TableHeaderCell>Raw events</TableHeaderCell>
                    <TableHeaderCell>Mapping</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {#each graphProjection.runtimeOperationRows as row (row.operation.id)}
                    <TableRow>
                      <TableCell>{operationKindLabel(row.operation)}</TableCell>
                      <TableCell as="th">{operationDisplayName(row.operation)}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.state)} size="sm">
                          {row.state}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.sourceText}</TableCell>
                      <TableCell>{formatEventReferences(row.operation.eventReferences)}</TableCell>
                      <TableCell>{row.mapping?.confidence ?? 'unmapped'}</TableCell>
                    </TableRow>
                  {/each}
                </TableBody>
              </Table>
            </div>
          {:else}
            <EmptyState title="No trace operations" headingLevel={2} />
          {/if}
        </TabPanel>

        <TabPanel value="overview">
          <div class="panel-grid">
            <Card title="Static source" headingLevel={2}>
              <DescriptionList
                variant="two-column"
                items={[
                  { term: 'Source', definition: sourceText(selectedWorkflow.source) },
                  { term: 'Exported', definition: selectedWorkflow.exported ? 'yes' : 'no' },
                  {
                    term: 'Worker registrations',
                    definition: String(artifacts.analysis.workers.length),
                  },
                  {
                    term: 'Temporal SDK packages',
                    definition:
                      artifacts.analysis.sdk.detectedPackages.join(', ') || 'none detected',
                  },
                ]}
              />
            </Card>

            <Card title="Runtime trace" headingLevel={2}>
              {#if selectedTrace}
                <DescriptionList
                  variant="two-column"
                  items={[
                    { term: 'Workflow ID', definition: selectedTrace.execution.workflowId },
                    { term: 'Run ID', definition: selectedTrace.execution.runId },
                    { term: 'Events', definition: String(selectedTrace.source.eventCount) },
                    {
                      term: 'Duration',
                      definition: formatDuration(selectedTrace.execution.durationMs),
                    },
                    ...(selectedOverlay
                      ? [
                          {
                            term: 'Mapped operations',
                            definition: `${selectedOverlay.mappings.length} mapped, ${selectedOverlay.coverage.nodes.unmappedRuntimeOperations} unmapped`,
                          },
                        ]
                      : []),
                    ...(workflowEventReferences.length > 0
                      ? [
                          {
                            term: 'Workflow events',
                            definition: formatEventReferences(workflowEventReferences),
                          },
                        ]
                      : []),
                  ]}
                />
              {:else}
                <EmptyState
                  title="No trace imported"
                  description="Import a Temporal Event History to see runtime status."
                  headingLevel={3}
                />
              {/if}
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="messages">
          <WorkflowMessagesPanel
            signals={selectedWorkflow.messageSurface.signals}
            queries={selectedWorkflow.messageSurface.queries}
            updates={selectedWorkflow.messageSurface.updates}
            {graphProjection}
          />
        </TabPanel>

        <TabPanel value="activities">
          <div class="table-panel">
            <Table caption="Activity commands" density="condensed">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Order</TableHeaderCell>
                  <TableHeaderCell>Activity</TableHeaderCell>
                  <TableHeaderCell>Source</TableHeaderCell>
                  <TableHeaderCell>Observed</TableHeaderCell>
                  <TableHeaderCell>Confidence</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#each activityCommands as command (command.id)}
                  <TableRow>
                    <TableCell align="right">{command.staticOrder + 1}</TableCell>
                    <TableCell as="th">{command.name}</TableCell>
                    <TableCell>{sourceText(command.source)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={observedActivityNames.has(command.name) ? 'success' : 'neutral'}
                      >
                        {observedActivityNames.has(command.name) ? 'observed' : 'not observed'}
                      </Badge>
                    </TableCell>
                    <TableCell>{command.confidence}</TableCell>
                  </TableRow>
                {/each}
              </TableBody>
            </Table>
          </div>

          {#if activityOperations.length > 0}
            <div class="table-panel">
              <Table caption="Runtime Activity operations" density="condensed">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Activity</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Attempts</TableHeaderCell>
                    <TableHeaderCell>Duration</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {#each activityOperations as operation (operation.id)}
                    <TableRow>
                      <TableCell as="th">{operation.activityType}</TableCell>
                      <TableCell>{operation.status}</TableCell>
                      <TableCell align="right">{operation.attempts.length}</TableCell>
                      <TableCell>{formatDuration(operation.durationMs)}</TableCell>
                    </TableRow>
                  {/each}
                </TableBody>
              </Table>
            </div>
          {/if}
        </TabPanel>

        <TabPanel value="types">
          <div class="panel-grid">
            <Card title="Input shape" headingLevel={2}>
              {#each selectedWorkflow.signature.args as argument (argument.id)}
                <code>{argument.displayName ?? 'argument'}: {argument.display}</code>
              {:else}
                <EmptyState title="No inputs" headingLevel={3} />
              {/each}
            </Card>
            <Card title="Result shape" headingLevel={2}>
              <code>{selectedWorkflow.signature.result.display}</code>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="diagnostics">
          {#if diagnostics.length > 0}
            <div class="table-panel">
              <Table caption="Diagnostics" density="condensed">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Severity</TableHeaderCell>
                    <TableHeaderCell>Code</TableHeaderCell>
                    <TableHeaderCell>Message</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {#each diagnostics as diagnostic (diagnostic.code + diagnostic.message)}
                    <TableRow>
                      <TableCell>{diagnostic.severity}</TableCell>
                      <TableCell as="th">{diagnostic.code}</TableCell>
                      <TableCell>{diagnostic.message}</TableCell>
                    </TableRow>
                  {/each}
                </TableBody>
              </Table>
            </div>
          {:else}
            <EmptyState
              title="No diagnostics"
              description="The committed artifacts do not report Workflow, trace, or overlay warnings."
              headingLevel={2}
            />
          {/if}
        </TabPanel>
      </Tabs>
    {:else}
      <EmptyState
        title="No Workflows found"
        description="Generate an analysis artifact before opening the explorer."
        headingLevel={1}
      />
    {/if}
  </main>
</div>

<style>
  .explorer-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: minmax(16rem, 19rem) minmax(0, 1fr);
  }

  .explorer-shell.embedded {
    min-height: 100%;
    grid-template-columns: minmax(0, 1fr);
  }

  :global(.workflow-sidebar) {
    border-right: 1px solid #cfd8df;
    background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(12px);
  }

  .brand-lockup {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 0.75rem;
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.375rem;
    background: #172026;
    color: #f7f9fb;
    font-weight: 760;
    letter-spacing: 0;
  }

  .brand-lockup p,
  .artifact-footer span,
  .eyebrow {
    margin: 0;
  }

  .brand-lockup p {
    font-weight: 700;
  }

  .brand-lockup div span,
  .artifact-footer span,
  .eyebrow,
  .signal-strip span {
    color: #5d6b75;
    font-size: 0.8125rem;
  }

  .workflow-nav-item,
  .signal-strip strong {
    overflow-wrap: anywhere;
  }

  .artifact-footer {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.875rem;
  }

  .workspace {
    min-width: 0;
    padding: clamp(1rem, 2vw, 2rem);
  }

  .embedded .workspace {
    padding: clamp(0.7rem, 1.2vw, 1rem);
  }

  .workflow-header,
  .signal-strip,
  .panel-grid {
    display: grid;
    gap: 1rem;
  }

  .workflow-header {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    margin-bottom: 1rem;
  }

  .embedded .workflow-header {
    align-items: center;
    margin-bottom: 0.35rem;
  }

  .workflow-switcher {
    display: grid;
    gap: 0.35rem;
    min-width: min(22rem, 34vw);
  }

  .workflow-switcher span {
    color: #5d6b75;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .workflow-switcher select {
    min-height: 2.45rem;
    width: 100%;
    border: 1px solid #c8d6dc;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #172026;
    font: inherit;
    font-weight: 650;
    padding: 0 2rem 0 0.75rem;
  }

  h1 {
    margin: 0.125rem 0 0;
    font-size: clamp(1.8rem, 2.4vw, 2.6rem);
    line-height: 1.04;
    letter-spacing: 0;
  }

  .embedded h1 {
    font-size: clamp(1.05rem, 1.25vw, 1.35rem);
  }

  .signature {
    display: block;
    margin: 0.55rem 0 0;
    color: #40515b;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.9375rem;
    line-height: 1.55;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .embedded .signature {
    margin-top: 0.18rem;
    font-size: 0.76rem;
    line-height: 1.35;
  }

  .syntax-function {
    color: #8a3ffc;
    font-weight: 720;
  }

  .syntax-identifier {
    color: #005f73;
  }

  .syntax-type {
    color: #0f7a55;
  }

  .syntax-punctuation {
    color: #64717a;
  }

  .signal-strip {
    position: relative;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    align-items: stretch;
    padding: 0.875rem 1rem;
    margin-bottom: 1rem;
    border: 1px solid #cbd7df;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(22, 32, 38, 0.05);
  }

  .embedded .signal-strip {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0;
    margin-bottom: 0.35rem;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .embedded .signal-strip strong {
    font-size: 0.82rem;
  }

  .embedded :global(.detail-tabs [role='tablist']) {
    margin-bottom: 0.35rem;
  }

  .signal-strip div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .embedded .signal-strip div {
    flex-direction: row;
    gap: 0.3rem;
    align-items: baseline;
  }

  .signal-strip strong {
    color: #172026;
    font-size: 1.25rem;
    line-height: 1.1;
  }

  :global(.detail-tabs) {
    min-width: 0;
  }

  .panel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .table-panel {
    margin-bottom: 1rem;
    overflow-x: auto;
    border: 1px solid #d3dde5;
    border-radius: 0.5rem;
    background: #ffffff;
  }

  code {
    display: block;
    padding: 0.625rem 0;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @media (max-width: 840px) {
    .explorer-shell {
      grid-template-columns: 1fr;
    }

    :global(.workflow-sidebar) {
      border-right: 0;
      border-bottom: 1px solid #cfd8df;
    }

    .workflow-header,
    .panel-grid {
      grid-template-columns: 1fr;
    }

    .workflow-switcher {
      min-width: 0;
    }

    .signal-strip {
      grid-auto-flow: row;
      grid-auto-columns: auto;
    }
  }
</style>
