# broadcastWorkflow

Source: `src/workflows/broadcast-workflow.ts:19`

Signature: `broadcastWorkflow(input: BroadcastInput): Promise<BroadcastResult>`

## Activities

| Order | Activity             | Source                                   | Observed | Confidence |
| ----: | -------------------- | ---------------------------------------- | -------- | ---------- |
|     1 | `prepareBroadcast`   | `src/workflows/broadcast-workflow.ts:20` | yes      | exact      |
|     2 | `deliverToChannel`   | `src/workflows/broadcast-workflow.ts:23` | yes      | exact      |
|     3 | `summarizeBroadcast` | `src/workflows/broadcast-workflow.ts:26` | yes      | exact      |

## Messages

- none

## Waits

- none

## Temporal Operations

- none

## Runtime Summary

- Mapped runtime operations: 7/7
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
