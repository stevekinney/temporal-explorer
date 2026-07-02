import type { PayloadReference } from '@temporal-explorer/schemas';

import {
  isRecord,
  readArrayField,
  readRecordField,
  readStringField,
  type HistoryEvent,
} from './history-json';

export type PayloadPreviewConfiguration = {
  /** Opt-in switch; previews stay off by default. */
  decodePayloads?: boolean;
  /** Legacy full-redaction switch; when true nothing is decoded. */
  redactPayloads?: boolean;
  /** Object keys whose values are recursively replaced with `[REDACTED]`. */
  redactKeys?: string[];
  /** Substring patterns; string values containing one are replaced. */
  redactPatterns?: string[];
  /** Maximum decoded preview size; larger payloads stay opaque. */
  maxPreviewBytes?: number;
};

function decodeBase64(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

function getPayloadEncoding(payload: Record<string, unknown>): string | undefined {
  const metadata = readRecordField(payload, 'metadata');
  const encoded = readStringField(metadata, 'encoding');
  return encoded ? decodeBase64(encoded) : undefined;
}

type PayloadPreviewResult =
  | {
      decoded: false;
    }
  | {
      decoded: true;
      preview: unknown;
      redacted: boolean;
    };

const redactedPlaceholder = '[REDACTED]';

type RedactionRules = {
  keys: Set<string>;
  patterns: string[];
};

type RedactionState = {
  redacted: boolean;
};

function redactString(value: string, rules: RedactionRules, state: RedactionState): string {
  if (rules.patterns.some((pattern) => value.includes(pattern))) {
    state.redacted = true;
    return redactedPlaceholder;
  }

  return value;
}

/** Recursively redacts configured keys and string patterns in a decoded preview. */
function redactPreview(value: unknown, rules: RedactionRules, state: RedactionState): unknown {
  if (typeof value === 'string') {
    return redactString(value, rules, state);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactPreview(entry, rules, state));
  }

  if (isRecord(value)) {
    const redacted: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      if (rules.keys.has(key)) {
        state.redacted = true;
        redacted[key] = redactedPlaceholder;
      } else {
        redacted[key] = redactPreview(entry, rules, state);
      }
    }

    return redacted;
  }

  return value;
}

function decodeJsonPayload(
  payload: Record<string, unknown>,
  configuration: PayloadPreviewConfiguration,
): PayloadPreviewResult {
  const data = readStringField(payload, 'data');
  const maxPreviewBytes = configuration.maxPreviewBytes ?? 0;

  if (!data || getPayloadEncoding(payload) !== 'json/plain') {
    return { decoded: false };
  }

  const decoded = decodeBase64(data);

  if (maxPreviewBytes <= 0 || Buffer.byteLength(decoded) > maxPreviewBytes) {
    return { decoded: false };
  }

  const rules: RedactionRules = {
    keys: new Set(configuration.redactKeys ?? []),
    patterns: configuration.redactPatterns ?? [],
  };
  const state: RedactionState = { redacted: false };
  const preview = redactPreview(JSON.parse(decoded) as unknown, rules, state);

  return {
    decoded: true,
    preview,
    redacted: state.redacted,
  };
}

export function createPayloadReferences(
  event: HistoryEvent,
  container: Record<string, unknown> | undefined,
  kind: PayloadReference['kind'],
  configuration: PayloadPreviewConfiguration,
): PayloadReference[] {
  const payloads = container ? readArrayField(container, 'payloads') : [];
  const shouldDecode =
    configuration.decodePayloads === true && configuration.redactPayloads !== true;

  return payloads.map((payload, index) => {
    const preview: PayloadPreviewResult =
      shouldDecode && isRecord(payload)
        ? decodeJsonPayload(payload, configuration)
        : { decoded: false };

    return {
      id: `payload:event-${event.eventId}:${kind}:${index}`,
      eventId: event.eventId,
      kind,
      decoded: preview.decoded,
      ...(preview.decoded ? { preview: preview.preview } : {}),
      redacted: preview.decoded ? preview.redacted : true,
    };
  });
}
