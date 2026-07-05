# screeningWorkflow

Source: `src/workflows/screening-workflow.ts:18`

Signature: `screeningWorkflow(input: ScreeningInput): Promise<ScreeningResult>`

## Activities

| Order | Activity          | Source                                   | Observed | Confidence |
| ----: | ----------------- | ---------------------------------------- | -------- | ---------- |
|     1 | `checkInventory`  | `src/workflows/screening-workflow.ts:20` | yes      | exact      |
|     2 | `checkPricing`    | `src/workflows/screening-workflow.ts:21` | yes      | exact      |
|     3 | `checkCompliance` | `src/workflows/screening-workflow.ts:22` | yes      | exact      |

## Messages

- none

## Waits

- none

## Temporal Operations

- none

## Runtime Summary

- Mapped runtime operations: 5/5
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
