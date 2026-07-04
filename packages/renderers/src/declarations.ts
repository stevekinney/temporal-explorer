import { dirname, relative } from 'node:path';

import type { TemporalAnalysisDocument, WorkflowDefinition } from '@temporal-explorer/schemas';

import { getWorkflow } from './shared';

/**
 * Directory of the generated declaration artifacts relative to the project
 * root; type imports are rewritten relative to this location.
 */
const declarationsDirectory = '.temporal-explorer/workflows';

function toImportSpecifier(module: string): string {
  const specifier = relative(dirname(`${declarationsDirectory}/placeholder.d.ts`), module)
    .split('\\')
    .join('/');
  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

function renderImports(workflow: WorkflowDefinition): string[] {
  const byModule = new Map<string, string[]>();

  for (const dependency of workflow.dependencies) {
    const names = byModule.get(dependency.module) ?? [];
    names.push(dependency.name);
    byModule.set(dependency.module, names);
  }

  return [...byModule.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(
      ([module, names]) =>
        `import type { ${names.toSorted((a, b) => a.localeCompare(b)).join(', ')} } from '${toImportSpecifier(module)}';`,
    );
}

function knownTypeNames(workflow: WorkflowDefinition): Set<string> {
  return new Set(workflow.dependencies.map((dependency) => dependency.name));
}

/**
 * Replaces named types that could not be resolved to a project module with
 * `unknown` so the declaration always type-checks. Resolved names, primitives,
 * and generics pass through untouched.
 */
function renderTypeText(display: string, known: Set<string>): string {
  return display.replaceAll(/\b[A-Z][A-Za-z0-9_]*\b/gu, (name) => {
    if (known.has(name) || structuralTypeNames.has(name)) {
      return name;
    }

    return 'unknown';
  });
}

const structuralTypeNames = new Set([
  'Promise',
  'Array',
  'Record',
  'Map',
  'Set',
  'Date',
  'Partial',
  'Readonly',
  'Pick',
  'Omit',
]);

function renderSignatureLines(workflow: WorkflowDefinition, known: Set<string>): string[] {
  const parameters = workflow.signature.args
    .map((arg, index) => {
      const rest = arg.isRest ? '...' : '';
      const optional = arg.optional ? '?' : '';
      return `${rest}${arg.displayName ?? `arg${index}`}${optional}: ${renderTypeText(arg.display, known)}`;
    })
    .join(', ');
  const result = renderTypeText(workflow.signature.result.display, known);
  const resultType = result.startsWith('Promise<') ? result : `Promise<${result}>`;

  return [
    `/** Source: ${workflow.source.path}:${workflow.source.start.line} [confidence: exact] */`,
    `export declare function ${workflow.name}(${parameters}): ${resultType};`,
  ];
}

function renderMessageLines(workflow: WorkflowDefinition, known: Set<string>): string[] {
  const lines: string[] = [];

  for (const signal of workflow.messageSurface.signals) {
    const args = signal.args.map((arg) => renderTypeText(arg.display, known)).join(', ');
    lines.push(
      `/** Source: ${signal.source.path}:${signal.source.start.line} [confidence: ${signal.confidence}] */`,
      `export declare const ${signal.name}Signal: import('@temporalio/workflow').SignalDefinition<[${args}]>;`,
    );
  }

  for (const query of workflow.messageSurface.queries) {
    const args = query.args.map((arg) => renderTypeText(arg.display, known)).join(', ');
    const result = query.result ? renderTypeText(query.result.display, known) : 'unknown';
    lines.push(
      `/** Source: ${query.source.path}:${query.source.start.line} [confidence: ${query.confidence}] */`,
      `export declare const ${query.name}Query: import('@temporalio/workflow').QueryDefinition<${result}, [${args}]>;`,
    );
  }

  for (const update of workflow.messageSurface.updates) {
    const args = update.args.map((arg) => renderTypeText(arg.display, known)).join(', ');
    const result = update.result ? renderTypeText(update.result.display, known) : 'unknown';
    lines.push(
      `/** Source: ${update.source.path}:${update.source.start.line} [confidence: ${update.confidence}] */`,
      `export declare const ${update.name}Update: import('@temporalio/workflow').UpdateDefinition<${result}, [${args}]>;`,
    );
  }

  return lines;
}

function renderActivityLines(
  analysis: TemporalAnalysisDocument,
  workflow: WorkflowDefinition,
): string[] {
  const activityCommands = workflow.temporalCommands.filter(
    (command) => command.kind === 'activity',
  );

  if (activityCommands.length === 0) {
    return [];
  }

  const names = [...new Set(activityCommands.map((command) => command.name))].toSorted((a, b) =>
    a.localeCompare(b),
  );
  const lines = ['/** Activity names referenced by this Workflow. */'];
  lines.push(
    `export type ${capitalize(workflow.name)}ActivityName = ${names
      .map((name) => `'${name}'`)
      .join(' | ')};`,
  );

  for (const name of names) {
    const activity = analysis.activities.find((candidate) => candidate.name === name);

    if (activity?.implementationSource) {
      lines.push(
        `/** Implementation: ${activity.implementationSource.path}:${activity.implementationSource.start.line} [confidence: ${activity.confidence}] */`,
      );
    } else {
      lines.push(
        `/** Implementation unresolved [confidence: ${activity?.confidence ?? 'unknown'}] */`,
      );
    }
  }

  return lines;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Renders the SDK-oriented `.d.ts` declaration artifact for one Workflow. */
export function renderWorkflowDeclaration(
  analysis: TemporalAnalysisDocument,
  workflowName: string,
): string {
  const workflow = getWorkflow(analysis, workflowName);
  const known = knownTypeNames(workflow);
  const sections = [
    ['// Generated by Temporal Workflow Explorer. Do not edit.'],
    renderImports(workflow),
    renderSignatureLines(workflow, known),
    renderMessageLines(workflow, known),
    renderActivityLines(analysis, workflow),
  ].filter((section) => section.length > 0);

  return `${sections.map((section) => section.join('\n')).join('\n\n')}\n`;
}
