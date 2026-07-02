import type { TypeShape } from '@temporal-explorer/schemas';

import { createTypeShape } from './type-shapes';

const nestingOpeners = new Set(['<', '[', '{', '(']);
const nestingClosers = new Set(['>', ']', '}', ')']);

/** Splits a tuple type's contents on top-level commas, preserving nested generics. */
export function splitTopLevel(contents: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of contents) {
    if (nestingOpeners.has(character)) {
      depth += 1;
    } else if (nestingClosers.has(character)) {
      depth -= 1;
    }

    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/** Converts a tuple type argument's text (such as `[A, B]`) into display type shapes. */
export function extractTupleShapes(idPrefix: string, tupleText: string | undefined): TypeShape[] {
  if (!tupleText) {
    return [];
  }

  const tupleContents = tupleText.replace(/^\[/u, '').replace(/\]$/u, '').trim();

  if (!tupleContents) {
    return [];
  }

  return splitTopLevel(tupleContents).map((display, index) =>
    createTypeShape(`${idPrefix}:arg:${index}`, display),
  );
}
