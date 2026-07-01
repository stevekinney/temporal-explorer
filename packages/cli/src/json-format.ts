const indentWidth = 2;
const maxInlineLength = 100;

function getIndent(level: number): string {
  return ' '.repeat(level * indentWidth);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isInlinePrimitive(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function formatPrimitive(value: unknown): string {
  return JSON.stringify(value) ?? 'null';
}

function formatArray(values: unknown[], level: number): string {
  if (values.length === 0) {
    return '[]';
  }

  if (values.every(isInlinePrimitive)) {
    const inline = `[${values.map(formatPrimitive).join(', ')}]`;

    if (getIndent(level).length + inline.length <= maxInlineLength) {
      return inline;
    }
  }

  const itemIndent = getIndent(level + 1);
  const items = values.map((item) => `${itemIndent}${formatJsonValue(item, level + 1)}`);
  return `[\n${items.join(',\n')}\n${getIndent(level)}]`;
}

function formatObject(value: Record<string, unknown>, level: number): string {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);

  if (entries.length === 0) {
    return '{}';
  }

  const propertyIndent = getIndent(level + 1);
  const properties = entries.map(
    ([key, property]) =>
      `${propertyIndent}${JSON.stringify(key)}: ${formatJsonValue(property, level + 1)}`,
  );

  return `{\n${properties.join(',\n')}\n${getIndent(level)}}`;
}

function formatJsonValue(value: unknown, level: number): string {
  if (Array.isArray(value)) {
    return formatArray(value, level);
  }

  if (isRecord(value)) {
    return formatObject(value, level);
  }

  return formatPrimitive(value);
}

export function stableJson(value: unknown): string {
  const normalized = JSON.parse(JSON.stringify(value)) as unknown;
  return `${formatJsonValue(normalized, 0)}\n`;
}
