# externalWorkflowInteraction

Source: `src/workflows/external-interaction-workflow.ts:31`

Signature: `externalWorkflowInteraction(input: ExternalInteractionInput): Promise<ExternalInteractionResult>`

## Activities

- none

## Messages

| Kind   | Name          | Payload  | Source                                              | Received | Confidence |
| ------ | ------------- | -------- | --------------------------------------------------- | -------- | ---------- |
| Signal | `targetReady` | `string` | `src/workflows/external-interaction-workflow.ts:17` | yes      | exact      |

## Waits

| Order | Kind      | Expression                             | Source                                              | Observed | Confidence |
| ----: | --------- | -------------------------------------- | --------------------------------------------------- | -------- | ---------- |
|     1 | condition | `() => targetWorkflowId !== undefined` | `src/workflows/external-interaction-workflow.ts:40` | no       | unknown    |

## Temporal Operations

| Order | Kind              | Target    | Source                                              | Observed | Confidence |
| ----: | ----------------- | --------- | --------------------------------------------------- | -------- | ---------- |
|     2 | external-workflow | `release` | `src/workflows/external-interaction-workflow.ts:43` | yes      | exact      |

## Runtime Summary

- Mapped runtime operations: 4/4
- Unmapped runtime operations: 0
- Received Signals: targetReady
- Payload previews: redacted by default

## Warnings

- none
