import {
  getTemporalExplorerVersion,
  renderWorkflowMermaidFromArtifacts,
} from '@temporal-explorer/api';

import { getPositionalArgs, parseFlags } from './arguments';
import {
  loadAnalysis,
  loadOverlay,
  loadReport,
  loadTrace,
  writeDocumentationArtifacts,
} from './artifact-files';
import { formatList, formatShow } from './formatters';
import { createHelpText } from './help';
import { stableJson } from './json-format';
import { startExplorerServer } from './open-server';

export { createHelpText } from './help';

type CommandEnvironment = {
  stdout: (text: string) => void | Promise<void>;
  stderr: (text: string) => void | Promise<void>;
  isInteractive: boolean;
};

async function runAnalyze(args: string[], environment: CommandEnvironment): Promise<number> {
  const flags = parseFlags(args);
  const { analysis, artifactPath } = await loadAnalysis(flags);

  if (flags.json) {
    await environment.stdout(stableJson(analysis));
    return 0;
  }

  await environment.stdout(
    `Analyzed ${analysis.workflows.length} workflow(s), ${analysis.activities.length} activity reference(s), and ${analysis.diagnostics.length} diagnostic(s).\nWrote ${artifactPath}\n`,
  );
  return 0;
}

async function runList(args: string[], environment: CommandEnvironment): Promise<number> {
  const flags = parseFlags(args);
  const { analysis } = await loadAnalysis(flags);
  await environment.stdout(flags.json ? stableJson(analysis.workflows) : formatList(analysis));
  return 0;
}

async function runShow(args: string[], environment: CommandEnvironment): Promise<number> {
  const flags = parseFlags(args);
  const [workflowName] = getPositionalArgs(args);

  if (!workflowName) {
    throw new Error('show requires a Workflow name.');
  }

  const { analysis } = await loadAnalysis(flags);
  const workflow = analysis.workflows.find((candidate) => candidate.name === workflowName);

  if (flags.json) {
    await environment.stdout(stableJson(workflow ?? null));
    return workflow ? 0 : 1;
  }

  await environment.stdout(formatShow(analysis, workflowName));
  return 0;
}

async function runHistory(args: string[], environment: CommandEnvironment): Promise<number> {
  const [subcommand] = getPositionalArgs(args);

  if (subcommand !== 'import') {
    throw new Error('history requires the import subcommand in the current MVP slice.');
  }

  const flags = parseFlags(args);
  const { trace, artifactPath } = await loadTrace(flags);

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

async function runDocs(args: string[], environment: CommandEnvironment): Promise<number> {
  const flags = parseFlags(args);
  const { files, outputDirectory } = await writeDocumentationArtifacts(flags);
  await environment.stdout(
    `Generated ${files.length} documentation file(s).\nWrote ${outputDirectory}\n`,
  );
  return 0;
}

async function runRender(args: string[], environment: CommandEnvironment): Promise<number> {
  const [workflowName] = getPositionalArgs(args);

  if (!workflowName) {
    throw new Error('render requires a Workflow name.');
  }

  const flags = parseFlags(args);
  const format = flags.format ?? 'mermaid';

  if (format !== 'mermaid') {
    throw new Error('render currently supports --format mermaid.');
  }

  const { analysis } = await loadAnalysis(flags);
  await environment.stdout(
    renderWorkflowMermaidFromArtifacts({
      analysisArtifact: analysis,
      workflowName,
    }),
  );
  return 0;
}

function parsePort(flagValue: string | undefined): number | undefined {
  if (!flagValue) {
    return undefined;
  }

  const port = Number(flagValue);

  if (!Number.isInteger(port)) {
    throw new Error(`Invalid --port value: ${flagValue}.`);
  }

  return port;
}

async function runOpen(args: string[], environment: CommandEnvironment): Promise<number> {
  const flags = parseFlags(args);
  const port = parsePort(flags.port);
  const server = await startExplorerServer({
    projectRoot: flags.project ?? process.cwd(),
    ...(port === undefined ? {} : { port }),
    ...(flags.trace === undefined ? {} : { trace: flags.trace }),
    inheritOutput: environment.isInteractive,
  });

  await environment.stdout(`Temporal Explorer available at ${server.url}\n`);

  if (environment.isInteractive) {
    await environment.stdout('Press Ctrl+C to stop the local explorer.\n');
    return await server.waitForExit();
  }

  await server.stop();
  await environment.stdout('Verified local explorer server startup and shutdown.\n');
  return 0;
}

type CommandHandler = (args: string[], environment: CommandEnvironment) => Promise<number>;

const commandHandlers = new Map<string, CommandHandler>([
  ['analyze', runAnalyze],
  ['docs', runDocs],
  ['history', runHistory],
  ['list', runList],
  ['open', runOpen],
  ['report', runReport],
  ['render', runRender],
  ['show', runShow],
  ['trace', runTrace],
]);

function createDefaultEnvironment(): CommandEnvironment {
  return {
    stdout: async (text) => {
      await Bun.write(Bun.stdout, text);
    },
    stderr: async (text) => {
      await Bun.write(Bun.stderr, text);
    },
    isInteractive: process.stdout.isTTY,
  };
}

export async function main(
  args: string[] = Bun.argv.slice(2),
  environment: CommandEnvironment = createDefaultEnvironment(),
): Promise<number> {
  const [command] = args;

  if (!command) {
    await environment.stdout(createHelpText());
    return 0;
  }

  const globalExitCode = await handleGlobalCommand(command, environment);

  if (globalExitCode !== undefined) {
    return globalExitCode;
  }

  const commandHandler = commandHandlers.get(command);

  try {
    if (!commandHandler) {
      return await reportUnimplementedCommand(command, environment);
    }

    return await commandHandler(args.slice(1), environment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await environment.stderr(`${message}\n`);
    return 1;
  }
}

async function handleGlobalCommand(
  command: string,
  environment: CommandEnvironment,
): Promise<number | undefined> {
  if (command === '--help' || command === '-h') {
    await environment.stdout(createHelpText());
    return 0;
  }

  if (command === '--version' || command === '-v') {
    await environment.stdout(`${getTemporalExplorerVersion()}\n`);
    return 0;
  }

  return undefined;
}

async function reportUnimplementedCommand(
  command: string,
  environment: CommandEnvironment,
): Promise<number> {
  await environment.stderr(`Command "${command}" is not implemented in the current MVP slice.\n`);
  return 1;
}
