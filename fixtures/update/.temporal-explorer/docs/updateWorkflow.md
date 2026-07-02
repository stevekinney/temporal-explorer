# updateWorkflow

Source: `src/workflows/update-workflow.ts:23`

Signature: `updateWorkflow(input: UpdateFixtureInput): Promise<UpdateFixtureResult>`

## Activities

| Order | Activity        | Source                                | Observed | Confidence |
| ----: | --------------- | ------------------------------------- | -------- | ---------- |
|     2 | `recordAddress` | `src/workflows/update-workflow.ts:51` | yes      | exact      |

## Messages

| Kind   | Name         | Payload           | Source                                | Received | Confidence |
| ------ | ------------ | ----------------- | ------------------------------------- | -------- | ---------- |
| Update | `explode`    | `string`          | `src/workflows/update-workflow.ts:17` | yes      | exact      |
| Update | `setAddress` | `ShippingAddress` | `src/workflows/update-workflow.ts:16` | yes      | exact      |

## Waits

| Order | Kind      | Expression                                        | Source                                | Observed | Confidence |
| ----: | --------- | ------------------------------------------------- | ------------------------------------- | -------- | ---------- |
|     1 | condition | `() => updatesApplied >= 1 && failedUpdates >= 1` | `src/workflows/update-workflow.ts:49` | no       | unknown    |

## Temporal Operations

- none

## Runtime Summary

- Mapped runtime operations: 5/5
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
