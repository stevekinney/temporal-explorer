# patchedWorkflow

Source: `src/workflows/patched-workflow.ts:10`

Signature: `patchedWorkflow(input: PatchedInput): Promise<PatchedResult>`

## Activities

| Order | Activity    | Source                                 | Observed | Confidence |
| ----: | ----------- | -------------------------------------- | -------- | ---------- |
|     3 | `newCharge` | `src/workflows/patched-workflow.ts:14` | yes      | exact      |
|     4 | `oldCharge` | `src/workflows/patched-workflow.ts:15` | no       | unknown    |

## Messages

- none

## Waits

- none

## Temporal Operations

| Order | Kind  | Target                             | Source                                 | Observed | Confidence |
| ----: | ----- | ---------------------------------- | -------------------------------------- | -------- | ---------- |
|     1 | patch | `legacy-tax-rounding` (deprecated) | `src/workflows/patched-workflow.ts:11` | yes      | exact      |
|     2 | patch | `use-modern-charge`                | `src/workflows/patched-workflow.ts:13` | yes      | exact      |

## Runtime Summary

- Mapped runtime operations: 5/5
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- none
