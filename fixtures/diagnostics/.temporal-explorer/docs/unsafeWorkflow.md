# unsafeWorkflow

Source: `src/workflows/unsafe-workflow.ts:22`

Signature: `unsafeWorkflow(input: string): Promise<string>`

## Activities

| Order | Activity             | Source                                | Observed | Confidence |
| ----: | -------------------- | ------------------------------------- | -------- | ---------- |
|     1 | `unresolvedActivity` | `src/workflows/unsafe-workflow.ts:37` | no       | unknown    |

## Messages

| Kind   | Name         | Payload  | Source                                | Received     | Confidence |
| ------ | ------------ | -------- | ------------------------------------- | ------------ | ---------- |
| Signal | `duplicated` | `string` | `src/workflows/unsafe-workflow.ts:11` | no           | unknown    |
| Query  | `progress`   | none     | `src/workflows/unsafe-workflow.ts:10` | not recorded | exact      |

Queries are served from Workflow state and do not normally add events to Event History.

## Waits

- none

## Temporal Operations

- none

## Runtime Summary

- No runtime overlay artifact was provided.

## Warnings

- error: Query handler progress mutates Workflow state: progress += 1
- error: Potential nondeterministic API inside Workflow: Date.now()
- error: Potential nondeterministic API inside Workflow: Math.random()
- error: Potential nondeterministic API inside Workflow: new Date()
