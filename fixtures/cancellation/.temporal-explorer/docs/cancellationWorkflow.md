# cancellationWorkflow

Source: `src/workflows/cancellation-workflow.ts:10`

Signature: `cancellationWorkflow(input: CancellationInput): Promise<CancellationResult>`

## Activities

| Order | Activity           | Source                                      | Observed | Confidence |
| ----: | ------------------ | ------------------------------------------- | -------- | ---------- |
|     2 | `reserveResources` | `src/workflows/cancellation-workflow.ts:13` | yes      | exact      |
|     4 | `useResources`     | `src/workflows/cancellation-workflow.ts:15` | no       | unknown    |
|     6 | `releaseResources` | `src/workflows/cancellation-workflow.ts:28` | yes      | exact      |

## Messages

- none

## Waits

| Order | Kind  | Expression  | Source                                      | Observed | Confidence |
| ----: | ----- | ----------- | ------------------------------------------- | -------- | ---------- |
|     3 | timer | `'30 days'` | `src/workflows/cancellation-workflow.ts:14` | yes      | exact      |

## Temporal Operations

| Order | Kind               | Target           | Source                                      | Observed | Confidence |
| ----: | ------------------ | ---------------- | ------------------------------------------- | -------- | ---------- |
|     1 | cancellation-scope | `cancellable`    | `src/workflows/cancellation-workflow.ts:12` | yes      | unknown    |
|     5 | cancellation-scope | `nonCancellable` | `src/workflows/cancellation-workflow.ts:27` | yes      | unknown    |

## Runtime Summary

- Mapped runtime operations: 6/6
- Unmapped runtime operations: 0
- Timers: 0 fired, 1 canceled, 0 pending
- Payload previews: redacted by default

## Warnings

- none
