import { getTemporalExplorerVersion } from '@temporal-explorer/api';

export function createHelpText(): string {
  return `Temporal Workflow Explorer ${getTemporalExplorerVersion()}

Usage: temporal-explorer <command> [options]

Commands:
  analyze              Analyze a Temporal TypeScript project and write artifacts
  list                 List discovered Workflows
  show <workflow>      Show one Workflow summary
  render <workflow>    Render a Workflow artifact such as Mermaid
  docs                 Generate deterministic Workflow documentation
  check                Run diagnostics and exit non-zero for configured errors
  history import       Import a Temporal Event History file
  trace <workflow>     Create a source-aware execution overlay
  report               Print a trace report
  doctor               Explain project detection and configuration
  open                 Open the local artifact-driven explorer

Options:
  --help, -h           Show this help text
  --version, -v        Show the Temporal Workflow Explorer version
`;
}
