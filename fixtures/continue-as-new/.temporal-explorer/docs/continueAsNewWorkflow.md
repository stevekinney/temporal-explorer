# continueAsNewWorkflow

Source: `src/workflows/continue-as-new-workflow.ts:10`

Signature: `continueAsNewWorkflow(input: IterationInput): Promise<string>`

## Activities

| Order | Activity          | Source                                         | Observed | Confidence |
| ----: | ----------------- | ---------------------------------------------- | -------- | ---------- |
|     1 | `recordIteration` | `src/workflows/continue-as-new-workflow.ts:11` | yes      | exact      |

## Messages

- none

## Waits

- none

## Temporal Operations

| Order | Kind            | Target                  | Source                                         | Observed | Confidence |
| ----: | --------------- | ----------------------- | ---------------------------------------------- | -------- | ---------- |
|     2 | continue-as-new | `continueAsNewWorkflow` | `src/workflows/continue-as-new-workflow.ts:14` | yes      | exact      |

## Runtime Summary

- Mapped runtime operations: 4/4
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
