# routingWorkflow

Source: `src/workflows/routing-workflow.ts:20`

Signature: `routingWorkflow(input: RoutingInput): Promise<RoutingResult>`

## Activities

| Order | Activity              | Source                                 | Observed | Confidence |
| ----: | --------------------- | -------------------------------------- | -------- | ---------- |
|     1 | `premiumFulfillment`  | `src/workflows/routing-workflow.ts:25` | yes      | exact      |
|     2 | `standardFulfillment` | `src/workflows/routing-workflow.ts:28` | no       | unknown    |
|     3 | `basicFulfillment`    | `src/workflows/routing-workflow.ts:31` | no       | unknown    |
|     4 | `recordRouting`       | `src/workflows/routing-workflow.ts:34` | yes      | exact      |

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
