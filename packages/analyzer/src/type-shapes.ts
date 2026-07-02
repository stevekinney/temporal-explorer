import type { SourceLocation, TypeShape } from '@temporal-explorer/schemas';

/** Creates a display-level type shape for a discovered type reference. */
export function createTypeShape(
  id: string,
  display: string,
  source?: SourceLocation,
  displayName?: string,
): TypeShape {
  return {
    id,
    display,
    ...(displayName ? { displayName } : {}),
    kind: display === 'void' ? 'primitive' : 'external',
    ...(source ? { source } : {}),
    confidence: display === 'unknown' ? 'unknown' : 'exact',
  };
}
