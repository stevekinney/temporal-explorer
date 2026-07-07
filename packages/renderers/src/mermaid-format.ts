import type { TemporalCommand } from '@temporal-explorer/schemas';

export function toMermaidId(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9_]/g, '_');
}

export function toMermaidLabel(value: string): string {
  return value.replaceAll('"', "'").replaceAll(/[\r\n]+/g, ' ');
}

export const flowCommandKinds = new Set<TemporalCommand['kind']>([
  'activity',
  'timer',
  'condition',
  'child-workflow',
  'external-workflow',
  'continue-as-new',
  'patch',
  'nexus-operation',
  'search-attribute',
  'dynamic',
]);

export function shapeForKind(kind: TemporalCommand['kind'], id: string, label: string): string {
  if (kind === 'condition' || kind === 'patch') {
    return `  ${id}{"${label}"}`;
  }

  if (kind === 'timer') {
    return `  ${id}(("${label}"))`;
  }

  if (kind === 'child-workflow' || kind === 'external-workflow') {
    return `  ${id}[["${label}"]]`;
  }

  if (kind === 'nexus-operation' || kind === 'dynamic') {
    return `  ${id}[/"${label}"/]`;
  }

  return `  ${id}["${label}"]`;
}
