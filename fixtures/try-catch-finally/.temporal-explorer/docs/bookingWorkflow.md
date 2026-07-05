# bookingWorkflow

Source: `src/workflows/booking-workflow.ts:17`

Signature: `bookingWorkflow(input: BookingInput): Promise<BookingResult>`

## Activities

| Order | Activity        | Source                                 | Observed | Confidence |
| ----: | --------------- | -------------------------------------- | -------- | ---------- |
|     1 | `reserveSeats`  | `src/workflows/booking-workflow.ts:21` | yes      | exact      |
|     2 | `recordFailure` | `src/workflows/booking-workflow.ts:23` | yes      | exact      |
|     3 | `releaseHold`   | `src/workflows/booking-workflow.ts:26` | yes      | exact      |

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
