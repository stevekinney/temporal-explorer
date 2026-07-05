# orchestrationWorkflow

Source: `src/workflows/orchestration-workflow.ts:22`

Signature: `orchestrationWorkflow(input: OrchestrationInput): Promise<OrchestrationResult>`

## Activities

| Order | Activity           | Source                                       | Observed | Confidence |
| ----: | ------------------ | -------------------------------------------- | -------- | ---------- |
|     1 | `buildPlan`        | `src/workflows/orchestration-workflow.ts:25` | yes      | exact      |
|     2 | `reserveInventory` | `src/workflows/orchestration-workflow.ts:31` | yes      | exact      |
|     3 | `reserveShipping`  | `src/workflows/orchestration-workflow.ts:32` | yes      | exact      |
|     4 | `confirmStage`     | `src/workflows/orchestration-workflow.ts:34` | yes      | exact      |
|     5 | `auditStage`       | `src/workflows/orchestration-workflow.ts:38` | yes      | exact      |
|     6 | `compensateStage`  | `src/workflows/orchestration-workflow.ts:40` | yes      | exact      |

## Messages

- none

## Waits

- none

## Temporal Operations

- none

## Runtime Summary

- Mapped runtime operations: 8/8
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
