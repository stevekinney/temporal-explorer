# parallelWorkflow

Source: `src/workflows/parallel-workflow.ts:24`

Signature: `parallelWorkflow(input: ReservationInput): Promise<ParallelResult>`

## Activities

| Order | Activity             | Source                                  | Observed | Confidence |
| ----: | -------------------- | --------------------------------------- | -------- | ---------- |
|     1 | `validateRequest`    | `src/workflows/parallel-workflow.ts:25` | yes      | exact      |
|     2 | `reserveInventory`   | `src/workflows/parallel-workflow.ts:28` | yes      | exact      |
|     3 | `reserveShipping`    | `src/workflows/parallel-workflow.ts:29` | yes      | exact      |
|     4 | `confirmReservation` | `src/workflows/parallel-workflow.ts:32` | yes      | exact      |

## Messages

- none

## Waits

- none

## Temporal Operations

- none

## Runtime Summary

- Mapped runtime operations: 6/6
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
