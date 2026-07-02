import type { Payload, PayloadCodec } from '@temporalio/common';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type SerializedPayload = {
  metadata: Record<string, string>;
  data?: string;
};

/**
 * A reversible fixture codec that marks payloads as `binary/encrypted`. It is
 * intentionally not real cryptography; it exists so committed fixture
 * histories contain encrypted-shaped payloads that the parser must treat as
 * opaque.
 */
class FixturePayloadCodec implements PayloadCodec {
  async encode(payloads: Payload[]): Promise<Payload[]> {
    return payloads.map((payload) => {
      const serialized: SerializedPayload = {
        metadata: Object.fromEntries(
          Object.entries(payload.metadata ?? {}).map(([key, value]) => [
            key,
            Buffer.from(value).toString('base64'),
          ]),
        ),
        ...(payload.data ? { data: Buffer.from(payload.data).toString('base64') } : {}),
      };

      return {
        metadata: {
          encoding: encoder.encode('binary/encrypted'),
          'fixture-codec': encoder.encode('reversible-base64'),
        },
        data: encoder.encode(Buffer.from(JSON.stringify(serialized)).toString('base64')),
      };
    });
  }

  async decode(payloads: Payload[]): Promise<Payload[]> {
    return payloads.map((payload) => {
      if (!payload.data) {
        return payload;
      }

      const serialized = JSON.parse(
        Buffer.from(decoder.decode(payload.data), 'base64').toString('utf8'),
      ) as SerializedPayload;

      return {
        metadata: Object.fromEntries(
          Object.entries(serialized.metadata).map(([key, value]) => [
            key,
            new Uint8Array(Buffer.from(value, 'base64')),
          ]),
        ),
        ...(serialized.data
          ? { data: new Uint8Array(Buffer.from(serialized.data, 'base64')) }
          : {}),
      };
    });
  }
}

export const payloadCodec: PayloadCodec = new FixturePayloadCodec();
