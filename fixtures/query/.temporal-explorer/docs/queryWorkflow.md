# queryWorkflow

Source: `src/workflows/query-workflow.ts:25`

Signature: `queryWorkflow(input: QueryFixtureInput): Promise<QueryFixtureResult>`

## Activities

| Order | Activity      | Source                               | Observed | Confidence |
| ----: | ------------- | ------------------------------------ | -------- | ---------- |
|     1 | `recordAudit` | `src/workflows/query-workflow.ts:45` | yes      | exact      |

## Messages

| Kind   | Name         | Payload  | Source                               | Received     | Confidence |
| ------ | ------------ | -------- | ------------------------------------ | ------------ | ---------- |
| Signal | `complete`   | none     | `src/workflows/query-workflow.ts:19` | yes          | exact      |
| Query  | `auditCount` | `string` | `src/workflows/query-workflow.ts:17` | not recorded | exact      |
| Query  | `bump`       | none     | `src/workflows/query-workflow.ts:18` | not recorded | exact      |
| Query  | `status`     | none     | `src/workflows/query-workflow.ts:16` | not recorded | exact      |

Queries are served from Workflow state and do not normally add events to Event History.

## Waits

| Order | Kind      | Expression   | Source                               | Observed | Confidence |
| ----: | --------- | ------------ | ------------------------------------ | -------- | ---------- |
|     2 | condition | `() => done` | `src/workflows/query-workflow.ts:48` | no       | unknown    |

## Temporal Operations

- none

## Runtime Summary

- Mapped runtime operations: 4/4
- Unmapped runtime operations: 0
- Received Signals: complete
- Payload previews: redacted by default

## Warnings

- error: Query handler bump mutates Workflow state: bumpCount += 1
