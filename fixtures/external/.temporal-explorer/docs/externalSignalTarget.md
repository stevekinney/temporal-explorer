# externalSignalTarget

Source: `src/workflows/external-interaction-workflow.ts:20`

Signature: `externalSignalTarget(): Promise<string>`

## Activities

- none

## Messages

| Kind   | Name      | Payload | Source                                              | Received | Confidence |
| ------ | --------- | ------- | --------------------------------------------------- | -------- | ---------- |
| Signal | `release` | none    | `src/workflows/external-interaction-workflow.ts:18` | no       | unknown    |

## Waits

| Order | Kind      | Expression       | Source                                              | Observed | Confidence |
| ----: | --------- | ---------------- | --------------------------------------------------- | -------- | ---------- |
|     1 | condition | `() => released` | `src/workflows/external-interaction-workflow.ts:27` | no       | unknown    |

## Temporal Operations

- none

## Runtime Summary

- No runtime overlay artifact was provided.

## Warnings

- none
