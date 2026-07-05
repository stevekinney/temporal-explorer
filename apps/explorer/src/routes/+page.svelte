<script lang="ts">
  import WorkflowFlowPanel from '$lib/components/workflow-flow-panel.svelte';
  import WorkflowMessagesPanel from '$lib/components/workflow-messages-panel.svelte';
  import { buildGraphProjection, formatEventReferences, sourceText } from '$lib/graph/projection';
  import {
    formatDuration,
    formatTimestamp,
    operationDisplayName,
    operationKindLabel,
    statusBadgeVariant,
  } from '$lib/graph/runtime-display';
  import { Badge } from '$cinder-components/badge';
  import { Button } from '$cinder-components/button';
  import { Card } from '$cinder-components/card';
  import { DescriptionList } from '$cinder-components/description-list';
  import { EmptyState } from '$cinder-components/empty-state';
  import { Sheet } from '$cinder-components/sheet';
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
    PanelRightOpen,
    Route,
  } from 'lucide-svelte';

  import type { PageProps } from './$types';

  type Workflow = PageProps['data']['analysis']['workflows'][number];
  type RuntimeOperation = PageProps['data']['traces'][number]['operations'][number];
  type ActivityOperation = Extract<RuntimeOperation, { kind: 'activity' }>;

  let { data }: PageProps = $props();
  let selectedWorkflowOverride = $state<string | undefined>();
  let activeTab = $state('flow');
  let inspectorOpen = $state(false);

  // Select by the unique workflow id, not the display name: versioned workflows
  // can share a registered name, so a name would not identify a single one.
  const selectedWorkflowId = $derived(
    selectedWorkflowOverride ?? data.analysis.workflows[0]?.id ?? '',
  );
  const selectedWorkflow = $derived.by(() => {
    return (
      data.analysis.workflows.find((workflow) => workflow.id === selectedWorkflowId) ??
      data.analysis.workflows[0]
    );
  });
  const selectedTrace = $derived.by(() => {
    const workflowTraces = data.traces.filter(
      (trace) => trace.execution.workflowType === selectedWorkflow?.name,
    );

    if (data.requestedTrace) {
      const requestedTrace = workflowTraces.find(
        (trace) =>
          trace.artifactId.includes(`trace:${data.requestedTrace}:`) ||
          trace.execution.workflowId === data.requestedTrace ||
          trace.execution.runId === data.requestedTrace,
      );

      if (requestedTrace) {
        return requestedTrace;
      }
    }

    return workflowTraces[0];
  });
  const selectedOverlay = $derived.by(() => {
    const workflowOverlays = data.overlays.filter(
      (overlay) => overlay.workflow === selectedWorkflow?.name,
    );

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

  function selectWorkflow(workflowId: string): void {
    selectedWorkflowOverride = workflowId;
    activeTab = 'flow';
  }
</script>

<svelte:head>
  <title>Temporal Workflow Explorer</title>
  <meta name="description" content="Local artifact-driven Temporal Workflow Explorer shell" />
</svelte:head>

<div class="explorer-shell">
  <Sidebar label="Workflow artifacts" class="workflow-sidebar">
    {#snippet brand()}
      <div class="brand-lockup">
        <span class="brand-mark">TE</span>
        <div>
          <p>Temporal Explorer</p>
          <span>{data.projectName}</span>
        </div>
      </div>
    {/snippet}

    {#snippet navigation()}
      <SideNavigation ariaLabel="Workflow selection">
        {#each data.analysis.workflows as workflow (workflow.id)}
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
        <span>{data.artifactDirectory}</span>
        <Badge variant="info" size="sm">{data.analysis.schemaVersion}</Badge>
      </div>
    {/snippet}
  </Sidebar>

  <main class="workspace" aria-labelledby="workflow-title">
    {#if selectedWorkflow}
      <section class="workflow-header">
        <div>
          <p class="eyebrow">Workflow artifact</p>
          <h1 id="workflow-title">{selectedWorkflow.name}</h1>
          <p class="signature">{workflowSignature(selectedWorkflow)}</p>
        </div>
        <Button variant="secondary" size="sm" onclick={() => (inspectorOpen = true)}>
          <PanelRightOpen size={16} aria-hidden="true" />
          Inspector
        </Button>
      </section>

      <section class="signal-strip" aria-label="Artifact summary">
        <div>
          <span>Activities</span>
          <strong>{activityCommands.length}</strong>
        </div>
        <div>
          <span>Observed</span>
          <strong>{selectedOverlay?.coverage.activities.observed ?? 0}</strong>
        </div>
        <div>
          <span>Runtime status</span>
          <strong>{selectedTrace?.execution.status ?? 'not imported'}</strong>
        </div>
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
                    definition: String(data.analysis.workers.length),
                  },
                  {
                    term: 'Temporal SDK packages',
                    definition: data.analysis.sdk.detectedPackages.join(', ') || 'none detected',
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

      <Sheet bind:open={inspectorOpen} title="Source and type inspector">
        <div class="inspector-stack">
          <section>
            <h2>Source</h2>
            <p>{sourceText(selectedWorkflow.source)}</p>
          </section>
          <section>
            <h2>Signature</h2>
            <pre>{workflowSignature(selectedWorkflow)}</pre>
          </section>
          <section>
            <h2>Runtime evidence</h2>
            <p>
              {selectedOverlay
                ? `${selectedOverlay.mappings.length} mapped operations with ${selectedOverlay.coverage.nodes.unmappedRuntimeOperations} unmapped.`
                : 'No overlay artifact is loaded.'}
            </p>
          </section>
          <section>
            <h2>Workflow raw events</h2>
            <pre>
              {workflowEventReferences.length > 0
                ? formatEventReferences(workflowEventReferences)
                : 'none'}
            </pre>
          </section>
        </div>
      </Sheet>
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

  .workflow-header,
  .signal-strip,
  .panel-grid {
    display: grid;
    gap: 1rem;
  }

  .workflow-header {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    margin-bottom: 1rem;
  }

  h1 {
    margin: 0.125rem 0 0;
    font-size: clamp(1.8rem, 2.4vw, 2.6rem);
    line-height: 1.04;
    letter-spacing: 0;
  }

  .signature {
    margin: 0.65rem 0 0;
    color: #34434f;
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    font-size: 0.9375rem;
    overflow-wrap: anywhere;
  }

  .signal-strip {
    position: relative;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: stretch;
    padding: 0.875rem 1rem;
    margin-bottom: 1rem;
    border: 1px solid #cbd7df;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(22, 32, 38, 0.05);
  }

  .signal-strip div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
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

  code,
  pre {
    font-family: 'SFMono-Regular', 'Cascadia Code', Consolas, monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  code {
    display: block;
    padding: 0.625rem 0;
  }

  .inspector-stack {
    display: grid;
    gap: 1rem;
  }

  .inspector-stack section {
    display: grid;
    gap: 0.35rem;
  }

  .inspector-stack h2 {
    margin: 0 0 0.35rem;
    font-size: 0.875rem;
  }

  .inspector-stack p,
  .inspector-stack pre {
    margin: 0;
    color: #34434f;
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
    .signal-strip,
    .panel-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
