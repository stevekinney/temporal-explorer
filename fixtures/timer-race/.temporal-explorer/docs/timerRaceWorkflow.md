# timerRaceWorkflow

Source: `src/workflows/timer-race-workflow.ts:12`

Signature: `timerRaceWorkflow(input: RaceInput): Promise<RaceResult>`

## Activities

| Order | Activity         | Source                                    | Observed | Confidence |
| ----: | ---------------- | ----------------------------------------- | -------- | ---------- |
|     3 | `notifyApproved` | `src/workflows/timer-race-workflow.ts:22` | yes      | exact      |
|     4 | `notifyExpired`  | `src/workflows/timer-race-workflow.ts:31` | no       | unknown    |

## Messages

| Kind   | Name      | Payload  | Source                                   | Received | Confidence |
| ------ | --------- | -------- | ---------------------------------------- | -------- | ---------- |
| Signal | `approve` | `string` | `src/workflows/timer-race-workflow.ts:6` | yes      | exact      |

## Waits

| Order | Kind      | Expression                       | Source                                    | Observed | Confidence |
| ----: | --------- | -------------------------------- | ----------------------------------------- | -------- | ---------- |
|     1 | condition | `() => approvedBy !== undefined` | `src/workflows/timer-race-workflow.ts:19` | no       | unknown    |
|     2 | timer     | `'30 days'`                      | `src/workflows/timer-race-workflow.ts:19` | yes      | exact      |

## Runtime Summary

- Mapped runtime operations: 5/5
- Unmapped runtime operations: 0
- Received Signals: approve
- Timers: 0 fired, 1 canceled, 0 pending
- Payload previews: redacted by default

## Warnings

- none
