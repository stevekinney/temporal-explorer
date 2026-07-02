# approvalWorkflow

Source: `src/workflows/approval-workflow.ts:16`

Signature: `approvalWorkflow(input: ApprovalInput): Promise<ApprovalResult>`

## Activities

| Order | Activity         | Source                                  | Observed | Confidence |
| ----: | ---------------- | --------------------------------------- | -------- | ---------- |
|     2 | `recordApproval` | `src/workflows/approval-workflow.ts:26` | yes      | exact      |

## Messages

| Kind   | Name      | Payload          | Source                                  | Received | Confidence |
| ------ | --------- | ---------------- | --------------------------------------- | -------- | ---------- |
| Signal | `approve` | `ApprovalRecord` | `src/workflows/approval-workflow.ts:10` | yes      | exact      |

## Waits

| Order | Kind      | Expression                     | Source                                  | Observed | Confidence |
| ----: | --------- | ------------------------------ | --------------------------------------- | -------- | ---------- |
|     1 | condition | `() => approval !== undefined` | `src/workflows/approval-workflow.ts:23` | no       | unknown    |

## Runtime Summary

- Mapped runtime operations: 4/4
- Unmapped runtime operations: 0
- Received Signals: approve
- Payload previews: redacted by default

## Warnings

- none
