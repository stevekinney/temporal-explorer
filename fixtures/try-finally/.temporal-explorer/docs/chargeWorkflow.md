# chargeWorkflow

Source: `src/workflows/charge-workflow.ts:16`

Signature: `chargeWorkflow(input: ChargeInput): Promise<TryFinallyResult>`

## Activities

| Order | Activity        | Source                                | Observed | Confidence |
| ----: | --------------- | ------------------------------------- | -------- | ---------- |
|     1 | `chargeAccount` | `src/workflows/charge-workflow.ts:18` | yes      | exact      |
|     2 | `releaseLock`   | `src/workflows/charge-workflow.ts:22` | yes      | exact      |

## Messages

- none

## Waits

- none

## Temporal Operations

- none

## Runtime Summary

- Mapped runtime operations: 4/4
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
