import { createAggregateReport, formatAggregateReport } from '@temporal-explorer/api';
import {
  executionOverlayDocumentSchema,
  runtimeTraceDocumentSchema,
} from '@temporal-explorer/schemas';

import { getPositionalArgs, parseFlags } from './arguments';
import {
  loadOverlay,
  loadReport,
  loadRuntimeArtifacts,
  loadTrace,
  writeDeclarationArtifacts,
} from './artifact-files';
import type { CommandEnvironment } from './command-environment';
import { createDoctorReport, formatDoctorReport } from './doctor';
import { stableJson } from './json-format';
import { fetchRunHistory, formatRuns, listRuns } from './live-commands';

async function runHistory(args: string[], environment: CommandEnvironment): Promise<number> {
  const [subcommand] = getPositionalArgs(args);

  if (subcommand === 'fetch') {
    const fetched = await fetchRunHistory(parseFlags(args));
    await environment.stdout(
      `Fetched ${fetched.eventCount} history event(s) for ${fetched.workflowType}.\nWrote ${fetched.artifactPath}\n`,
    );
    return 0;
  }

  if (subcommand !== 'import') {
    throw new Error('history requires the import or fetch subcommand.');
  }

  const flags = parseFlags(args);
  const { trace, artifactPath, decodesPayloads } = await loadTrace(flags);

  if (decodesPayloads) {
    await environment.stderr(
      `Warning: decoded payload previews will be written to ${artifactPath}.\n`,
    );
  }

  if (flags.json) {
    await environment.stdout(stableJson(trace));
    return 0;
  }

  await environment.stdout(
    `Imported ${trace.source.eventCount} history event(s) for ${trace.execution.workflowType} (${trace.execution.status}).\nWrote ${artifactPath}\n`,
  );
  return 0;
}

async function runTrace(args: string[], environment: CommandEnvironment): Promise<number> {
  const [workflowName] = getPositionalArgs(args);

  if (!workflowName) {
    throw new Error('trace requires a Workflow name.');
  }

  const flags = parseFlags(args);
  const { overlay, artifactPath } = await loadOverlay(flags, workflowName);

  if (flags.json) {
    await environment.stdout(stableJson(overlay));
    return 0;
  }

  await environment.stdout(
    `Mapped ${overlay.mappings.length} runtime operation(s) for ${overlay.workflow}; ${overlay.coverage.nodes.unmappedRuntimeOperations} unmapped.\nWrote ${artifactPath}\n`,
  );
  return 0;
}

async function runReport(args: string[], environment: CommandEnvironment): Promise<number> {
  const flags = parseFlags(args);
  await environment.stdout(await loadReport(flags));
  return 0;
}

async function runRuns(args: string[], environment: CommandEnvironment): Promise<number> {
  const [subcommand] = getPositionalArgs(args);

  if (subcommand !== 'list') {
    throw new Error('runs requires the list subcommand.');
  }

  const flags = parseFlags(args);
  const runs = await listRuns(flags);

  await environment.stdout(flags.json ? stableJson(runs) : formatRuns(runs));
  return 0;
}

async function runAggregate(args: string[], environment: CommandEnvironment): Promise<number> {
  const [workflowName] = getPositionalArgs(args);

  if (!workflowName) {
    throw new Error('aggregate requires a Workflow name.');
  }

  const flags = parseFlags(args);
  const { traces, overlays } = await loadRuntimeArtifacts(flags);
  const report = createAggregateReport({
    workflowType: workflowName,
    traces: traces.map((artifact) => runtimeTraceDocumentSchema.parse(artifact)),
    overlays: overlays.map((artifact) => executionOverlayDocumentSchema.parse(artifact)),
  });

  await environment.stdout(flags.json ? stableJson(report) : formatAggregateReport(report));
  return 0;
}

async function runTypes(args: string[], environment: CommandEnvironment): Promise<number> {
  const flags = parseFlags(args);
  const [workflowName] = getPositionalArgs(args);
  const { files, outputDirectory } = await writeDeclarationArtifacts(flags, workflowName);

  await environment.stdout(
    `Generated ${files.length} declaration file(s).\nWrote ${outputDirectory}\n`,
  );
  return 0;
}

async function runDoctor(args: string[], environment: CommandEnvironment): Promise<number> {
  const flags = parseFlags(args);
  const report = await createDoctorReport(flags.project);

  await environment.stdout(flags.json ? stableJson(report) : formatDoctorReport(report));
  return 0;
}

export { runAggregate, runDoctor, runHistory, runReport, runRuns, runTrace, runTypes };
