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
  import { Badge } from '@lostgradient/cinder/badge';
  import { Card } from '@lostgradient/cinder/card';
  import { CodeBlock } from '@lostgradient/cinder/code-block';
  import { DescriptionList } from '@lostgradient/cinder/description-list';
  import { EmptyState } from '@lostgradient/cinder/empty-state';
  import { SideNavigation } from '@lostgradient/cinder/side-navigation';
  import { SideNavigationItem } from '@lostgradient/cinder/side-navigation-item';
  import { Tab } from '@lostgradient/cinder/tab';
  import { TabList } from '@lostgradient/cinder/tab-list';
  import { TabPanel } from '@lostgradient/cinder/tab-panel';
  import { Table } from '@lostgradient/cinder/table';
  import { TableBody } from '@lostgradient/cinder/table-body';
  import { TableCell } from '@lostgradient/cinder/table-cell';
  import { TableHeader } from '@lostgradient/cinder/table-header';
  import { TableHeaderCell } from '@lostgradient/cinder/table-header-cell';
  import { TableRow } from '@lostgradient/cinder/table-row';
  import { Tabs } from '@lostgradient/cinder/tabs';
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
    selectedWorkflowId = $bindable<string | undefined>(),
    siteUrl,
  }: {
    artifacts: ExplorerArtifacts;
    embedded?: boolean;
    requestedTrace?: string | undefined;
    selectedWorkflowId?: string | undefined;
    siteUrl?: string | undefined;
  } = $props();
  let activeTab = $state('flow');
  let previousSelectedWorkflowId = $state<string | undefined>();

  // Default to the workflow the requested trace actually ran, so a project with several
  // workflows (a parent plus its children) opens on the one being inspected rather than
  // whichever happens to be first — which can be a trivial child that renders as a lone node.
  const defaultWorkflowId = $derived(selectDefaultWorkflowId(artifacts, requestedTrace));
  // Select by the unique workflow id, not the display name: versioned workflows
  // can share a registered name, so a name would not identify a single one.
  const effectiveSelectedWorkflowId = $derived(selectedWorkflowId ?? defaultWorkflowId);
  const selectedWorkflow = $derived.by(() => {
    return (
      artifacts.analysis.workflows.find(
        (workflow) => workflow.id === effectiveSelectedWorkflowId,
      ) ?? artifacts.analysis.workflows[0]
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

  $effect(() => {
    const workflowId = effectiveSelectedWorkflowId;

    if (previousSelectedWorkflowId && previousSelectedWorkflowId !== workflowId) {
      activeTab = 'flow';
    }

    previousSelectedWorkflowId = workflowId;
  });

  function isActivityOperation(operation: RuntimeOperation): operation is ActivityOperation {
    return operation.kind === 'activity';
  }

  function selectWorkflow(workflowId: string): void {
    selectedWorkflowId = workflowId;
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
    <aside class="workflow-sidebar" aria-label="Workflow artifacts">
      <div class="brand-lockup">
        <span class="brand-mark">TE</span>
        <div>
          <p>Temporal Explorer</p>
          <span>{artifacts.projectName}</span>
        </div>
      </div>

      <nav class="workflow-sidebar-navigation" aria-label="Workflow selection">
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
      </nav>

      <div class="artifact-footer">
        <span>{artifacts.artifactDirectory}</span>
        <Badge variant="info" size="sm">{artifacts.analysis.schemaVersion}</Badge>
      </div>
    </aside>
  {/if}

  <main class="workspace" aria-labelledby="workflow-title">
    {#if selectedWorkflow}
      <section class="workflow-header">
        <div class="header-rail" aria-hidden="true"></div>
        <div>
          <div class="title-line">
            <h1 id="workflow-title">{selectedWorkflow.name}</h1>
            {#if selectedTrace}
              <Badge
                variant={selectedTrace.execution.status === 'completed' ? 'success' : 'neutral'}
                size="sm"
              >
                {selectedTrace.execution.status}
              </Badge>
            {/if}
          </div>
          <p class="run-line">
            <span>Run ID:</span>
            <code>{selectedTrace?.execution.runId ?? 'static analysis only'}</code>
          </p>
        </div>
        <dl class="artifact-summary" aria-label="Artifact summary">
          <div>
            <dt>Activities</dt>
            <dd>{activityCommands.length}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{messageSurfaceCount}</dd>
          </div>
          {#if selectedTrace}
            <div>
              <dt>Observed</dt>
              <dd>{selectedOverlay?.coverage.activities.observed ?? 0}</dd>
            </div>
          {/if}
          <div>
            <dt>Diagnostics</dt>
            <dd>{diagnostics.length}</dd>
          </div>
        </dl>
        {#if embedded && artifacts.analysis.workflows.length > 1}
          <label class="workflow-switcher">
            <span>Workflow</span>
            <select
              value={effectiveSelectedWorkflowId}
              onchange={(event) => selectWorkflow(event.currentTarget.value)}
            >
              {#each artifacts.analysis.workflows as workflow (workflow.id)}
                <option value={workflow.id}>{workflow.name}</option>
              {/each}
            </select>
          </label>
        {/if}
      </section>

      <Tabs bind:value={activeTab} class="detail-tabs">
        <TabList label="Workflow detail views">
          <Tab value="flow"><GitBranch size={17} aria-hidden="true" />Flow</Tab>
          <Tab value="history"><History size={17} aria-hidden="true" />History</Tab>
          <Tab value="trace"><Route size={17} aria-hidden="true" />Trace</Tab>
          <Tab value="overview"><FileText size={17} aria-hidden="true" />Overview</Tab>
          <Tab value="messages"><MessageSquare size={17} aria-hidden="true" />Messages</Tab>
          <Tab value="activities"><Activity size={17} aria-hidden="true" />Activities</Tab>
          <Tab value="types"><Braces size={17} aria-hidden="true" />Types</Tab>
          <Tab value="diagnostics">
            <AlertTriangle size={17} aria-hidden="true" />
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
                <CodeBlock
                  code={`${argument.displayName ?? 'argument'}: ${argument.display}`}
                  language="ts"
                  showLanguageLabel={false}
                  class="type-code-block"
                />
              {:else}
                <EmptyState title="No inputs" headingLevel={3} />
              {/each}
            </Card>
            <Card title="Result shape" headingLevel={2}>
              <CodeBlock
                code={selectedWorkflow.signature.result.display}
                language="ts"
                showLanguageLabel={false}
                class="type-code-block"
              />
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
    grid-template-columns: minmax(17rem, 18rem) minmax(0, 1fr);
    background: #f4f7f7;
  }

  .explorer-shell.embedded {
    min-height: 100%;
    grid-template-columns: minmax(0, 1fr);
  }

  .workflow-sidebar {
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    border-right: 1px solid #b9c8ce;
    background:
      linear-gradient(90deg, #13333a 0 2.75rem, transparent 2.75rem),
      linear-gradient(90deg, rgba(15, 143, 131, 0.06) 1px, transparent 1px) 0 0 / 2.75rem 2.75rem,
      rgba(246, 248, 248, 0.9);
    backdrop-filter: blur(12px);
  }

  .workflow-sidebar-navigation {
    min-height: 0;
    overflow: auto;
    padding: 0.45rem 0.5rem 0.45rem 0.75rem;
  }

  :global(.workflow-sidebar .cinder-side-navigation__list) {
    gap: 0.1rem;
  }

  :global(.workflow-sidebar .cinder-navigation-item) {
    min-height: 2.15rem;
    border-radius: 0.3rem;
  }

  .brand-lockup {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.9rem 0.8rem 1.1rem 0.65rem;
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid #2d474f;
    border-radius: 0;
    background: transparent;
    color: #f6f8f8;
    font-weight: 760;
    letter-spacing: 0;
  }

  .brand-lockup p,
  .artifact-footer span {
    margin: 0;
  }

  .brand-lockup p {
    font-weight: 700;
  }

  .brand-lockup div span,
  .artifact-footer span {
    color: #62727a;
    font-size: 0.8125rem;
  }

  .workflow-nav-item {
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
    padding: clamp(0.9rem, 1.4vw, 1.35rem);
  }

  .embedded .workspace {
    padding: clamp(0.7rem, 1.2vw, 1rem);
  }

  .workflow-header,
  .panel-grid {
    display: grid;
    gap: 1rem;
  }

  .workflow-header {
    position: relative;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.65rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid #c3d0d5;
    border-radius: 0.4rem;
    background:
      linear-gradient(90deg, rgba(15, 143, 131, 0.08), transparent 34rem), rgba(255, 255, 255, 0.82);
  }

  .embedded .workflow-header {
    align-items: center;
    margin-bottom: 0;
  }

  .header-rail {
    width: 0.24rem;
    align-self: stretch;
    min-height: 2.55rem;
    border-radius: 999px;
    background: #0f8f83;
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
    border: 1px solid #b9c8ce;
    border-radius: 0.35rem;
    background: #ffffff;
    color: #152027;
    font: inherit;
    font-weight: 650;
    padding: 0 2rem 0 0.75rem;
  }

  .title-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.18rem, 1.45vw, 1.55rem);
    line-height: 1.04;
    letter-spacing: 0;
  }

  .embedded h1 {
    font-size: clamp(1.05rem, 1.25vw, 1.35rem);
  }

  .run-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    margin: 0.25rem 0 0;
    color: #40515b;
    font-size: 0.76rem;
  }

  .run-line span {
    color: #62727a;
    font-weight: 650;
  }

  .run-line code {
    display: inline;
    padding: 0;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.74rem;
    white-space: nowrap;
  }

  .embedded .run-line {
    margin-top: 0.15rem;
  }

  .artifact-summary {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.35rem 0.85rem;
    min-width: 0;
    margin: 0;
    padding: 0;
  }

  .artifact-summary div {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    min-width: 0;
  }

  .artifact-summary dt,
  .artifact-summary dd {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.1;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .artifact-summary dt {
    color: #62727a;
  }

  .artifact-summary dd {
    color: #152027;
    font-weight: 700;
  }

  .embedded :global(.detail-tabs [role='tablist']) {
    margin-bottom: 0.35rem;
  }

  :global(.detail-tabs) {
    min-width: 0;
  }

  :global(.detail-tabs [role='tablist']) {
    border-bottom-color: #b9c8ce;
    margin-bottom: 0.65rem;
  }

  :global(.detail-tabs [role='tab']) {
    color: #2d3d45;
  }

  :global(.detail-tabs [role='tab'][aria-selected='true']) {
    color: #254fe8;
  }

  .panel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .table-panel {
    margin-bottom: 1rem;
    overflow-x: auto;
    border: 1px solid #c3d0d5;
    border-radius: 0.45rem;
    background: #ffffff;
  }

  :global(.type-code-block.cinder-code-block) {
    margin-top: 0.45rem;
    border-color: #d5e0e4;
    border-radius: 0.35rem;
  }

  :global(.type-code-block .cinder-code-block__pre),
  :global(.type-code-block .cinder-code-block__highlighted pre.shiki) {
    padding: 0.65rem 0.75rem !important;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  @media (max-width: 840px) {
    .explorer-shell {
      grid-template-columns: 1fr;
    }

    .workflow-sidebar {
      grid-template-rows: auto auto auto;
      border-right: 0;
      border-bottom: 1px solid #b9c8ce;
    }

    .workflow-sidebar-navigation {
      max-height: 14rem;
    }

    .workflow-header,
    .panel-grid {
      grid-template-columns: 1fr;
    }

    .header-rail {
      display: none;
    }

    .workflow-switcher {
      min-width: 0;
    }

    .artifact-summary {
      justify-content: flex-start;
    }
  }
</style>
