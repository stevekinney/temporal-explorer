# Verification Log

## 2026-06-30: Baseline Install

Command: `bun install`

Result: Passed.

Output summary: Bun checked 29 installs across 62 packages, installed lefthook hooks, and reported no dependency changes.

Follow-up: None.

## 2026-06-30: 100 Percent Coverage Gate

Command: `bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage`

Result: Failed during coverage hardening, then passed.

Output summary: Coverage started at 93.09% functions and 90.50% lines. Focused tests were added for CLI errors and server lifecycle branches, Event History parsing failures and payload decoding, analyzer metadata and dynamic Activity diagnostics, API warning propagation, mapper/rendering edge cases, and Explorer artifact/graph projections. Unreachable defensive branches were removed or simplified where caller control flow already proved the condition. The final `lcov` audit reported `TOTAL lines 3154/3154; funcs 375/375`.

Follow-up: None.

## 2026-06-30: Baseline Template Validation

Command: `bun run validate`

Result: Passed.

Output summary: Turbo ran lint, typecheck, test, and build for `@repo/server`, `@repo/shared`, and `@repo/typescript-configuration`; Prettier format check passed.

Follow-up: Replace template example workspaces with Temporal Workflow Explorer workspaces, then rerun Stage 0 gates.

## 2026-06-30: Stage 0 Workspace Install

Command: `bun install`

Result: Passed.

Output summary: Bun linked the new `@temporal-explorer/*` workspaces, saved `bun.lock`, and installed workspace dependencies.

Follow-up: None.

## 2026-06-30: Stage 0 Typecheck

Command: `bun run typecheck`

Result: Failed once, then passed.

Output summary: The first run found CLI write callbacks returning byte counts instead of `void`; after updating the CLI environment callbacks, Turbo typechecked `@temporal-explorer/api`, `@temporal-explorer/cli`, `@temporal-explorer/explorer`, and `@temporal-explorer/schemas` successfully.

Follow-up: None.

## 2026-06-30: Stage 0 Tests

Command: `bun test`

Result: Passed.

Output summary: Seven tests passed across the explorer shell, CLI help, schema version scaffold, and public API result scaffold.

Follow-up: None.

## 2026-06-30: Stage 0 CLI Help

Command: `bunx temporal-explorer --help`

Result: Passed.

Output summary: The local `temporal-explorer` binary printed the MVP command help and exited successfully.

Follow-up: None.

## 2026-06-30: Stage 0 Full Template Validation

Command: `bun run validate`

Result: Failed once, then passed.

Output summary: The first run exposed missing `oxlint-tsgolint` for type-aware linting. After adding the root dev dependency and fixing one touched-file lint warning, Turbo lint, typecheck, test, and build passed for all workspaces and Prettier format check passed.

Follow-up: None.

## 2026-06-30: Stage 1 Schema Tests

Command: `bun test packages/schemas`

Result: Passed.

Output summary: Four schema tests passed, covering artifact version names, known-version detection, canonical `temporal-analysis/v1` validation, and malformed artifact rejection with issue paths.

Follow-up: None.

## 2026-06-30: Stage 1 History Generation

Command: `bun run fixtures:generate-histories`

Result: Failed once, then passed.

Output summary: The first implementation reached a real Temporal worker but Temporal's `historyToJSON` helper failed under Bun on payload metadata conversion. The generator now uses an explicit JSON-compatible protobuf walker, then normalizes volatile fields and writes `fixtures/basic-order/histories/success.json` plus provenance.

Follow-up: None.

## 2026-06-30: Stage 1 Fixture Validation

Command: `bun run fixtures:validate`

Result: Failed once, then passed.

Output summary: The first run could not resolve the internal schema workspace from root scripts. After adding `@temporal-explorer/schemas` as a root dev dependency, validation passed with 1 history fixture and 0 Temporal Explorer artifact fixtures.

Follow-up: Later stages will add generated `.temporal-explorer` artifacts for this fixture.

## 2026-06-30: Stage 1 Drift Check

Command: `bun run fixtures:verify-no-drift`

Result: Failed twice during normalization hardening, then passed.

Output summary: The drift checker exposed unstable worker `identity`, SDK metadata flag ordering, and `historySizeBytes`. After normalizing those fields, regeneration produced no drift.

Follow-up: None.

## 2026-06-30: Root Script Typecheck

Command: `bunx tsc --noEmit`

Result: Failed twice, then passed.

Output summary: The first run needed root `@types/bun`; the second found an exact-optional-property issue in the Temporal worker options. After adding root `@types/bun` and omitting `namespace` when undefined, root scripts typechecked successfully. `bun run typecheck` now includes root `tsc --noEmit`.

Follow-up: None.

## 2026-06-30: Stage 1 Full Validation

Command: `bun run validate`

Result: Passed.

Output summary: Root typecheck plus Turbo workspace lint, test, and build passed. Prettier format check passed.

Follow-up: None.

## 2026-06-30: Stage 2 Analyzer and API Tests

Command: `bun test packages/analyzer` and `bun test packages/api`

Result: Passed.

Output summary: Analyzer tests discovered `basicOrderWorkflow`, its `OrderInput` signature, the direct `validateOrder`, `chargeCard`, and `shipOrder` Activity calls, and no diagnostics. API tests confirmed the public result wrapper and fixture-backed analysis path.

Follow-up: None.

## 2026-06-30: Stage 2 CLI Analysis Commands

Command: `bunx temporal-explorer analyze --project fixtures/basic-order`, `bunx temporal-explorer analyze --project fixtures/basic-order --json`, `bunx temporal-explorer list --project fixtures/basic-order`, and `bunx temporal-explorer show basicOrderWorkflow --project fixtures/basic-order`

Result: Passed.

Output summary: Analyze wrote `fixtures/basic-order/.temporal-explorer/analysis.json` with 1 workflow, 3 Activity references, and 0 diagnostics. List and show reported `basicOrderWorkflow(input: OrderInput): Promise<OrderResult>` and the expected Activity calls.

Follow-up: None.

## 2026-06-30: Stage 2 Artifact and CLI Fixture Gates

Command: `bun run schema:validate fixtures/basic-order/.temporal-explorer/analysis.json` and `bun run test:cli -- --fixture basic-order`

Result: Passed.

Output summary: The generated analysis artifact validated as `temporal-analysis/v1`. The fixture-targeted CLI suite passed five tests covering help, analyze JSON, list, and show.

Follow-up: None.

## 2026-06-30: Stage 2 Full Validation

Command: `bun run validate`

Result: Passed.

Output summary: Root typecheck plus Turbo workspace lint, test, and build passed for all six workspaces. Prettier format check passed after CLI tests regenerated the analysis artifact.

Follow-up: None.

## 2026-06-30: Stage 3 History Package Tests

Command: `bun test packages/history`

Result: Passed.

Output summary: Two tests passed. The parser converts the real basic-order Event History into `temporal-trace/v1` with completed workflow status, three completed Activity executions, redacted payload references, and no diagnostics. A synthetic unknown event produces a `TEH_UNKNOWN_EVENT_TYPE` warning.

Follow-up: None.

## 2026-06-30: Stage 3 History Import CLI

Command: `bunx temporal-explorer history import --project fixtures/basic-order --file fixtures/basic-order/histories/success.json`

Result: Passed.

Output summary: The CLI imported 23 history events for `basicOrderWorkflow`, reported completed status, and wrote `fixtures/basic-order/.temporal-explorer/histories/success.trace.json`.

Follow-up: None.

## 2026-06-30: Stage 3 Trace Artifact Validation

Command: `bun run schema:validate fixtures/basic-order/.temporal-explorer/histories/*.trace.json`

Result: Passed.

Output summary: `fixtures/basic-order/.temporal-explorer/histories/success.trace.json` validated as `temporal-trace/v1`.

Follow-up: None.

## 2026-06-30: Stage 3 Fixture Gate

Command: `bun run test:fixtures -- --fixture basic-order-history`

Result: Passed.

Output summary: The fixture gate confirmed `basicOrderWorkflow`, completed execution status, three Activity executions, and redacted payload previews by default.

Follow-up: None.

## 2026-06-30: Stage 3 Full Validation

Command: `bun run validate`

Result: Passed.

Output summary: Root typecheck plus Turbo workspace lint, test, and build passed across seven workspaces. Prettier format check passed after CLI tests regenerated both analysis and trace artifacts.

Follow-up: None.

## 2026-06-30: Stage 4 Mapper Tests

Command: `bun test packages/mapper`

Result: Passed.

Output summary: The mapper test validated `temporal-overlay/v1`, mapped three Activity runtime operations to static Activity commands, recorded command-order evidence, reported zero unmapped runtime operations, and generated a report line for `validateOrder` with source location and exact confidence.

Follow-up: None.

## 2026-06-30: Stage 4 Trace CLI

Command: `bunx temporal-explorer trace basicOrderWorkflow --project fixtures/basic-order --history success`

Result: Passed.

Output summary: The command mapped 5 runtime operations for `basicOrderWorkflow`, reported 0 unmapped operations, and wrote `fixtures/basic-order/.temporal-explorer/overlays/success.overlay.json`.

Follow-up: None.

## 2026-06-30: Stage 4 Overlay Schema Validation

Command: `bun run schema:validate fixtures/basic-order/.temporal-explorer/overlays/*.overlay.json`

Result: Passed.

Output summary: `fixtures/basic-order/.temporal-explorer/overlays/success.overlay.json` validated as `temporal-overlay/v1`.

Follow-up: None.

## 2026-06-30: Stage 4 Report CLI

Command: `bunx temporal-explorer report --project fixtures/basic-order --trace success`

Result: Passed.

Output summary: The report showed 5/5 mapped runtime operations, 0 unmapped runtime operations, and listed `validateOrder`, `chargeCard`, and `shipOrder` as observed with Workflow source locations and exact confidence.

Follow-up: None.

## 2026-06-30: Stage 4 CLI Fixture Gate

Command: `bun run test:cli -- --fixture basic-order-overlay`

Result: Passed.

Output summary: Seven CLI tests passed, including overlay mapping and report generation for the basic-order fixture.

Follow-up: None.

## 2026-06-30: Stage 4 Full Validation

Command: `bun run validate`

Result: Passed.

Output summary: Root typecheck plus Turbo workspace lint, test, and build passed across eight workspaces. Prettier format check passed after generated analysis, trace, and overlay artifacts were regenerated by tests.

Follow-up: None.

## 2026-06-30: Stage 5 Renderer Tests

Command: `bun test packages/renderers`

Result: Passed.

Output summary: The renderer test confirmed deterministic Markdown and Mermaid output, relative source paths, redacted payload summary text, and the expected basic-order Mermaid edge.

Follow-up: None.

## 2026-06-30: Stage 5 Documentation CLI

Command: `bunx temporal-explorer docs --project fixtures/basic-order`

Result: Passed.

Output summary: The CLI generated three documentation files under `fixtures/basic-order/.temporal-explorer/docs`: `index.md`, `basicOrderWorkflow.md`, and `basicOrderWorkflow.mmd`.

Follow-up: None.

## 2026-06-30: Stage 5 Mermaid Render CLI

Command: `bunx temporal-explorer render basicOrderWorkflow --project fixtures/basic-order --format mermaid`

Result: Passed.

Output summary: The CLI printed a deterministic `flowchart TD` with the expected `validateOrder`, `chargeCard`, and `shipOrder` Activity sequence.

Follow-up: None.

## 2026-06-30: Stage 5 Snapshot Verification

Command: `bun run snapshots:verify`

Result: Passed.

Output summary: The snapshot verifier rendered docs twice, confirmed deterministic output, and verified all three generated documentation snapshots match the renderer output.

Follow-up: None.

## 2026-06-30: Stage 5 Full Validation

Command: `bun run validate`

Result: Failed once, then passed.

Output summary: The first run exposed non-Prettier Markdown table alignment in generated docs. After updating the renderer to emit aligned Markdown tables and regenerating docs, root typecheck, Turbo lint/test/build, and Prettier format check all passed.

Follow-up: None.

## 2026-06-30: Stage 6 Explorer Typecheck and Tests

Command: `bun run --cwd apps/explorer typecheck` and `bun test apps/explorer`

Result: Failed during implementation, then passed.

Output summary: Early SvelteKit SSR failed because the server artifact loader used `Bun.file`; the loader now uses Node filesystem primitives and schema validation. Later typecheck failures exposed that Cinder source imports need SvelteKit `kit.alias` plus `allowImportingTsExtensions`; after moving the alias into `svelte.config.js`, `svelte-check` reported 0 errors and 0 warnings. The explorer tests passed 2 tests covering shell identity and committed artifact loading.

Follow-up: Cinder package compatibility issue filed upstream as https://github.com/stevekinney/cinder/issues/580.

## 2026-06-30: Stage 6 Open CLI Gate

Command: `bunx temporal-explorer open --project fixtures/basic-order`

Result: Failed during implementation, then passed.

Output summary: The first failures came from SvelteKit SSR and then from waiting on the cold artifact page render as a server readiness signal. The CLI now verifies the local Vite server readiness endpoint and returns `Temporal Explorer available at http://127.0.0.1:5173/`, then verifies startup and shutdown in non-interactive mode.

Follow-up: Full page rendering remains covered by the Playwright UI gate.

## 2026-06-30: Stage 6 Explorer E2E

Command: `bun run ui:e2e`

Result: Failed twice, then passed.

Output summary: A parallel local run first raced multiple UI scripts for the same default port. The sequential e2e run then exposed a hydration timing issue and a strict locator conflict for `validateOrder`. After waiting for `networkidle` before interaction and scoping the locator to the Activity commands table, the smoke test opened the fixture UI, selected Activities, found `validateOrder`, opened the inspector, and confirmed `src/workflows/basic-order-workflow.ts:16`.

Follow-up: None.

## 2026-06-30: Stage 6 Accessibility

Command: `bun run ui:accessibility`

Result: Failed once, then passed.

Output summary: Axe reported one `color-contrast` violation on the `TE` brand mark because a generic sidebar span selector overrode the intended light text color. After narrowing the selector to the project-name span, the accessibility audit passed with 0 violations.

Follow-up: None.

## 2026-06-30: Stage 6 Server Lifecycle

Command: `bun run ui:server-lifecycle`

Result: Passed.

Output summary: The lifecycle script started the local explorer, verified the Vite readiness endpoint, stopped the process, and confirmed the local server no longer responded.

Follow-up: None.

## 2026-06-30: Stage 6 Full Validation

Command: `bun run validate`

Result: Failed once, then passed.

Output summary: The first run passed typecheck, tests, and builds but exposed explorer lint warnings for default-importing named Cinder component exports, a JSON parse error without a preserved cause, and Prettier drift in the implementation tracking tables. After switching to named Cinder imports, preserving the parse error cause, and formatting the docs, root typecheck, Turbo lint/test/build, and Prettier format check all passed with 0 lint warnings.

Follow-up: None.

## 2026-06-30: Stage 7 Explorer Typecheck and Tests

Command: `bun run --cwd apps/explorer typecheck` and `bun test apps/explorer`

Result: Failed during implementation, then passed.

Output summary: The first Svelte typecheck found a component type export in the wrong script context and an unsupported Svelte Flow controls prop. After moving the custom node data type to module context and using `showLock`, `svelte-check` reported 0 errors and 0 warnings. Explorer tests passed 3 tests, including the new graph projection test against validated fixture artifacts.

Follow-up: None.

## 2026-06-30: Stage 7 Existing UI E2E

Command: `bun run ui:e2e`

Result: Failed once, then passed.

Output summary: The first run exposed a regression in the global inspector fallback after Stage 7 selection state was added. The inspector now falls back to the selected Workflow source when no graph selection is active, preserving the Stage 6 smoke path. The rerun passed.

Follow-up: None.

## 2026-06-30: Stage 7 Graph E2E

Command: `bun run ui:e2e:graph`

Result: Failed during implementation, then passed.

Output summary: The first graph run proved timeline-to-graph and graph-to-timeline behavior but exposed missing Svelte Flow handles for custom nodes and an unreliable direct SVG edge-click locator. Custom nodes now expose target/source handles, and the Flow view includes an accessible edge list that selects the same edge state. The passing gate verifies timeline operation selection highlights `chargeCard`, graph node selection filters the timeline to `validateOrder`, edge selection opens edge evidence, and the inspector shows source plus raw event references.

Follow-up: None.

## 2026-06-30: Stage 7 Trace Open Gate

Command: `bunx temporal-explorer open --project fixtures/basic-order --trace success`

Result: Passed.

Output summary: The local Explorer server started, returned `http://127.0.0.1:5173/?trace=success`, and shut down cleanly in non-interactive verification mode.

Follow-up: None.

## 2026-06-30: Stage 7 Screenshot Verification

Command: `bun run screenshots:verify`

Result: Passed.

Output summary: Playwright opened the fixture Explorer, waited for the Flow graph, captured the graph surface to a temporary PNG, and rejected blank or unexpectedly small captures. The screenshot verification passed with output at `/var/folders/x_/bxpb13p12psfxqy5vbnl6d7c0000gn/T/temporal-explorer-flow.png`.

Follow-up: None.

## 2026-06-30: MVP Release Verification

Command: `bun install`, `bun run typecheck`, `bun test`, `bun run fixtures:generate-histories`, `bun run fixtures:validate`, `bun run fixtures:verify-no-drift`, `bun run test:cli`, `bun run snapshots:verify`, `bun run ui:e2e`, `bun run ui:accessibility`, `bun run ui:server-lifecycle`, `bun run package:check`, `bun run validate`, `bun run ui:e2e:graph`, and `bun run screenshots:verify`

Result: Failed during final cleanup, then passed.

Output summary: The first `bun run validate` after Stage 7 exposed real lint failures in the new graph code: page and projection max-lines limits, projection helper complexity, and a promise `always-return` warning. The graph UI was split into smaller Svelte components, ELK layout was moved to a helper, runtime display/state helpers were extracted, and graph projection builders were split until `svelte-check`, oxlint, UI gates, graph gates, and screenshots passed. A later final `format:check` exposed that `fixtures/basic-order/histories/success.json` was Prettier-incompatible; formatting the file directly caused fixture drift, so the fixture generator now writes Prettier-formatted history and provenance JSON before hashing. The final explicit MVP gate list passed. `package:check` completed as an npm dry run with 128 files, 135.5 kB package size, and no tarball left behind. The Temporal SDK under Bun emitted the known `v8.promiseHooks.createHook is not available; stack trace collection will be disabled.` notice during fixture generation and drift checks, but those gates passed.

Follow-up: None.

## 2026-07-01: Post-MVP Foundation (event table + manifest-driven fixtures)

- `bun run fixtures:verify-no-drift` — pass (basic-order byte-identical under refactored generator).
- `bun run fixtures:validate` — pass (1 history, 3 artifacts).
- `bun run fixtures:regenerate-artifacts` — pass, idempotent across two runs from the repository root.
- `bun run snapshots:verify` — pass (3 documentation snapshots).
- `bun run validate` — pass (typecheck, lint, test, build, format across all workspaces).
- Note: `packages/history/src/event-types.ts` previously mismapped event types 17/18 (Temporal proto defines 17=TimerStarted, 18=TimerFired; the file claimed WorkflowExecutionCanceled/Terminated). Fixed against `@temporalio/proto` 1.18.1 before any timer fixtures exist.
- Note: analysis/trace artifacts previously embedded `process.cwd()`-relative project paths, so CLI tests (cwd=packages/cli) and root scripts fought over committed artifact content. Artifacts now record the project directory basename.

## 2026-07-01: Stage 9A Signals, Conditions, and Timers (packages)

- `bun run fixtures:generate-histories` — pass; 13 histories across 12 fixtures generated from real Temporal executions (approval, timer-race signal-wins/timeout, query, update, retry success/failure, child-workflow, external, cancellation, continue-as-new, patched, dynamic).
- `bun run fixtures:verify-no-drift` — pass twice back-to-back after two determinism fixes: UUIDs embedded in longer strings (update `acceptedRequestMessageId`) now normalize by substring, and proto map fields (`metadata`, `indexedFields`) serialize with sorted keys.
- `bun test packages/analyzer packages/history packages/mapper packages/schemas packages/cli` — pass (signal/condition/timer discovery, signal/timer trace parsing, signal-name and timer-order mapping, branch skip detection, check command).
- `bun run test:fixtures` — pass (basic-order, approval, timer-race assertions).
- `bun run fixtures:regenerate-artifacts` — pass for artifact-enabled fixtures (basic-order, approval, timer-race).
- Found and fixed: `node_modules/.bin/temporal-explorer` pointed at `src/index.ts` (an importable module with no entrypoint side effect) because `bun.lock` still recorded the pre-MVP bin path. Every `bunx temporal-explorer` invocation had become a silent no-op. Corrected the lock entry to `src/bin.ts` and re-ran the affected CLI gates for real: `check` (exit 0 clean fixture), `list`, `show`, `history import`, `trace`, `report`, `docs`, `render` all behave.

## 2026-07-01: Stage 9A Completion (UI, gates, and commit)

- Explorer UI now projects signal, timer, and condition nodes with runtime states; Messages tab lists signal payloads and handler sources; inspector shows timer status and duration.
- `bun test apps/explorer` — 13 pass. `bun run --cwd apps/explorer typecheck` — clean.
- `bun run ui:e2e`, `bun run ui:e2e:graph` (including a timer-race timeout trace assertion), `bun run ui:accessibility` — pass.
- Root-caused and fixed a pre-existing e2e flake: the `$cinder-components` alias skips Vite pre-bundling, so the first page request pays a ~15s on-demand compile that could blow Playwright's navigation timeout. Fixed with a warm-up fetch after server start, not a timeout bump.
- `bun run validate` — pass end to end after fixing: a duplicate-import lint error, Prettier-incompatible emitted JSON Schema documents (now formatted with the repo Prettier config), and a Zod `toJSONSchema` overload mismatch.
- `bun run fixtures:validate` (14 histories, 11 artifacts), `bun run test:fixtures`, `bun run snapshots:verify` (9 documents) — pass.
- Stage 12 groundwork landed: JSON Schema documents are emitted from the Zod schemas, drift-checked, and verified against committed artifacts with an independent (non-TypeScript) validator; CLI artifact writes are schema-validated before hitting disk.
- Stage 13 spike landed: `bun run replay:spike` proves replay resolves dynamic dispatch, branch outcomes, and command sequences; decision recorded in decisions.md.
