# basicOrderWorkflow

Source: `src/workflows/basic-order-workflow.ts:16`

Signature: `basicOrderWorkflow(input: OrderInput): Promise<OrderResult>`

## Activities

| Order | Activity        | Source                                     | Observed | Confidence |
| ----: | --------------- | ------------------------------------------ | -------- | ---------- |
|     1 | `validateOrder` | `src/workflows/basic-order-workflow.ts:17` | yes      | exact      |
|     2 | `chargeCard`    | `src/workflows/basic-order-workflow.ts:18` | yes      | exact      |
|     3 | `shipOrder`     | `src/workflows/basic-order-workflow.ts:19` | yes      | exact      |

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
