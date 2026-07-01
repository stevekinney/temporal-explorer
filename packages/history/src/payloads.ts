import type { PayloadReference } from '@temporal-explorer/schemas';

import {
  isRecord,
  readArrayField,
  readRecordField,
  readStringField,
  type HistoryEvent,
} from './history-json';

export type PayloadPreviewConfiguration = {
  decodePayloads?: boolean;
  redactPayloads?: boolean;
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
    };

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

  return {
    decoded: true,
    preview: JSON.parse(decoded) as unknown,
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
    configuration.decodePayloads === true && configuration.redactPayloads === false;

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
      redacted: !preview.decoded,
    };
  });
}
