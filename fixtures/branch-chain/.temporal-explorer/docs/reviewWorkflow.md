# reviewWorkflow

Source: `src/workflows/review-workflow.ts:17`

Signature: `reviewWorkflow(input: ReviewInput): Promise<ReviewResult>`

## Activities

| Order | Activity          | Source                                | Observed | Confidence |
| ----: | ----------------- | ------------------------------------- | -------- | ---------- |
|     1 | `seniorApproval`  | `src/workflows/review-workflow.ts:21` | no       | unknown    |
|     2 | `managerApproval` | `src/workflows/review-workflow.ts:23` | yes      | exact      |
|     3 | `autoApprove`     | `src/workflows/review-workflow.ts:25` | no       | unknown    |
|     4 | `finalizeReview`  | `src/workflows/review-workflow.ts:28` | yes      | exact      |

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
