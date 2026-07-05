# raceWorkflow

Source: `src/workflows/race-workflow.ts:19`

Signature: `raceWorkflow(input: RaceInput): Promise<RaceResult>`

## Activities

| Order | Activity         | Source                              | Observed | Confidence |
| ----: | ---------------- | ----------------------------------- | -------- | ---------- |
|     1 | `fetchLivePrice` | `src/workflows/race-workflow.ts:21` | yes      | exact      |
|     3 | `recordQuote`    | `src/workflows/race-workflow.ts:26` | yes      | exact      |

## Messages

- none

## Waits

| Order | Kind  | Expression       | Source                              | Observed | Confidence |
| ----: | ----- | ---------------- | ----------------------------------- | -------- | ---------- |
|     2 | timer | `PRICE_DEADLINE` | `src/workflows/race-workflow.ts:22` | yes      | exact      |

## Temporal Operations

- none

## Runtime Summary

- Mapped runtime operations: 5/5
- Unmapped runtime operations: 0
- Timers: 0 fired, 0 canceled, 1 pending
- Payload previews: redacted by default

## Warnings

- none
