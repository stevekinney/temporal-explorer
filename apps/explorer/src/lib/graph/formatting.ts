import type { EventReference, SourceLocation } from '@temporal-explorer/schemas';

export function sourceText(source: SourceLocation | undefined): string {
  return source ? `${source.path}:${source.start.line}` : 'not resolved';
}

export function formatEventReferences(eventReferences: EventReference[]): string {
  return eventReferences
    .map((reference) => `Event ${reference.eventId} ${reference.eventType}`)
    .join(', ');
}
