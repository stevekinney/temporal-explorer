# Performance Budgets

Budgets are enforced by failing benchmark scripts, not by observation. The
`fixtures/large` project (one Workflow, 60 Activities, a signal, a condition,
and a timer; 370-event history) is the reference load.

| Surface                    | Command                      | Budget  | Latest  |
| -------------------------- | ---------------------------- | ------- | ------- |
| Static analysis (ts-morph) | `bun run benchmark:analyzer` | 15000ms | ~3600ms |
| Event History parsing      | `bun run benchmark:history`  | 1000ms  | ~25ms   |

Update the Latest column when budgets are re-baselined; tightening a budget
requires a passing run at the new value.

## UI thresholds (planned)

The Explorer graph thresholds from the product plan (collapse above 200
nodes, search-first above 500 nodes, virtualized timelines above 1,000
operations) are tracked with the remaining Explorer UI work in
`docs/implementation/progress.md` (Stage 8/14 notes).
