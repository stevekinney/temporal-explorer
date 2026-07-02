# childWorkflowParent

Source: `src/workflows/child-workflow-parent.ts:37`

Signature: `childWorkflowParent(input: ParentInput): Promise<ParentResult>`

## Activities

- none

## Messages

- none

## Waits

- none

## Temporal Operations

| Order | Kind           | Target                     | Source                                      | Observed | Confidence |
| ----: | -------------- | -------------------------- | ------------------------------------------- | -------- | ---------- |
|     1 | child-workflow | `reserveInventoryChild`    | `src/workflows/child-workflow-parent.ts:38` | yes      | exact      |
|     2 | child-workflow | `releaseNotificationChild` | `src/workflows/child-workflow-parent.ts:42` | yes      | exact      |

## Runtime Summary

- Mapped runtime operations: 4/4
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
