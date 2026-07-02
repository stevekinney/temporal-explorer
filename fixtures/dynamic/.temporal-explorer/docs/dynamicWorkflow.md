# dynamicWorkflow

Source: `src/workflows/dynamic-workflow.ts:12`

Signature: `dynamicWorkflow(input: DynamicInput): Promise<DynamicResult>`

## Activities

| Order | Activity         | Source                                 | Observed | Confidence |
| ----: | ---------------- | -------------------------------------- | -------- | ---------- |
|     1 | `archiveRequest` | `src/workflows/dynamic-workflow.ts:14` | yes      | exact      |

## Messages

- none

## Waits

- none

## Temporal Operations

| Order | Kind    | Target                    | Source                                 | Observed | Confidence |
| ----: | ------- | ------------------------- | -------------------------------------- | -------- | ---------- |
|     2 | dynamic | `dynamicActivities[step]` | `src/workflows/dynamic-workflow.ts:18` | yes      | dynamic    |

## Runtime Summary

- Mapped runtime operations: 5/5
- Unmapped runtime operations: 0
- Payload previews: redacted by default

## Warnings

- warning: Dynamic Activity call could not be fully resolved: dynamicActivities[step]
