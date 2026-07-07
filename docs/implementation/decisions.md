# Implementation Decisions

## 2026-06-30: Use the Current Template-Derived Repository

Context: The goal objective says to create the implementation repository from the local `~/.bun-create/turbo` template. The current working repository at `/Users/stevekinney/Developer/temporal-explorer` is already a Bun-first Turbo scaffold with the expected template workspaces, shared TypeScript configuration, hooks, and validation scripts.

Decision: Reshape the current repository in place instead of creating a sibling `temporal-workflow-explorer` directory. The root package keeps the product package name `temporal-explorer`, while internal implementation workspaces use the `@temporal-explorer/*` namespace.

Alternatives considered: Create a new sibling directory from the template. That would leave the configured workspace root unused and duplicate the already-verified template scaffold.

Verification impact: Stage 0 records the baseline `bun install` and `bun run validate` results before template examples are replaced.

## 2026-06-30: Start `apps/explorer` as a Workspace Shell

Context: Stage 0 requires the `apps/explorer` boundary, while SvelteKit, Cinder, artifact loading, and Playwright gates are Stage 6 concerns.

Decision: Create `apps/explorer` as a typed workspace shell during Stage 0, then convert it to the full SvelteKit local UI when Stage 6 begins.

Alternatives considered: Pull SvelteKit files from `~/.bun-create/sveltekit-temporal` immediately. That risks copying application, database, deployment, and pnpm assumptions before artifact contracts exist.

Verification impact: Stage 0 validates the workspace boundary without making UI internals depend on analyzer code. Stage 6 will replace the shell with the artifact-driven SvelteKit implementation.

## 2026-06-30: Use Zod as the Runtime Artifact Schema Source

Context: Stage 1 needs durable `temporal-analysis/v1`, `temporal-trace/v1`, and `temporal-overlay/v1` contracts that can validate generated artifacts at runtime.

Decision: Define artifact schemas in `packages/schemas` with Zod and expose `validateArtifact` keyed by `schemaVersion`. TypeScript types are inferred from the runtime schemas so package consumers and CLI code share one contract source.

Alternatives considered: Hand-written TypeScript-only types or separate JSON Schema files. Type-only contracts would not validate artifact files, and separate schema files would create two sources of truth this early.

Verification impact: `bun test packages/schemas` validates canonical artifacts and rejects malformed artifacts with issue paths. `bun run fixtures:validate` uses the same schema package for committed Temporal Explorer artifacts.

## 2026-06-30: Generate the Basic Order History with Temporal Test Environment

Context: Stage 1 requires a real Event History fixture, not hand-authored plausible JSON.

Decision: Use `TestWorkflowEnvironment.createTimeSkipping` and a real Temporal Worker to execute `basicOrderWorkflow`, fetch the Event History, and write `fixtures/basic-order/histories/success.json`.

Alternatives considered: Hand-writing a minimal history or storing only parser-oriented fixtures. That would violate the fixture truth requirement and fail to prove the Temporal SDK integration path.

Verification impact: `bun run fixtures:generate-histories` executes the workflow through Temporal. `bun run fixtures:verify-no-drift` reruns the same generation path and compares normalized output.

## 2026-06-30: Normalize Volatile History Fields

Context: Real Temporal histories include volatile run IDs, event timestamps, worker identities, SDK flag order, and history size metadata.

Decision: Normalize run IDs to `success-run-id`, event timestamps to `2026-01-01T00:00:00.000Z` plus event ID milliseconds, worker identities to `temporal-explorer-fixture-worker`, SDK flag arrays to sorted order, and `historySizeBytes` to `0`.

Alternatives considered: Commit raw histories and accept drift, or weaken drift checks. Raw histories create churn; weak drift checks would not catch meaningful fixture changes.

Verification impact: `bun run fixtures:verify-no-drift` regenerates the real history and now passes deterministically.

## 2026-06-30: Trust Temporal Toolchain Postinstall Dependencies

Context: Installing Temporal SDK packages with Bun blocked lifecycle scripts for `@swc/core` and `protobufjs`, both required by the Temporal worker bundling/protobuf toolchain.

Decision: Trust only `@swc/core` and `protobufjs` in `trustedDependencies`.

Alternatives considered: Leave scripts blocked. That risks failing workflow bundling or protobuf conversion at fixture generation time.

Verification impact: `bun run fixtures:generate-histories` can create a worker bundle and execute the basic-order fixture.

## 2026-06-30: Promote Static Analysis into `packages/analyzer`

Context: Stage 2 needs source inspection with `ts-morph`, direct Activity call discovery, worker detection, source locations, and fixture-backed tests. Keeping that logic in the API package would mix product orchestration with compiler implementation details.

Decision: Add `packages/analyzer` as the package that owns TypeScript project loading, Workflow source discovery, Temporal symbol inspection, package metadata reading, and analysis artifact assembly. `packages/api` re-exports the analyzer through stable public functions.

Alternatives considered: Put the analyzer directly in `packages/api` or in the CLI. API placement would blur library boundaries; CLI placement would prevent library consumers from using the same analysis path.

Verification impact: `bun test packages/analyzer`, `bun test packages/api`, and the CLI analyze/list/show gates all exercise the same analyzer output.

## 2026-06-30: Keep CLI Commands on Public API Functions

Context: Stage 2 requires CLI commands for analyze, list, and show, but those commands must not duplicate compiler traversal or artifact construction logic.

Decision: Have `packages/cli` call `loadTemporalExplorerProject` and `analyzeProject` from `@temporal-explorer/api`, then format command-specific output from the returned `TemporalAnalysisDocument`.

Alternatives considered: Have the CLI instantiate `ts-morph` or read analyzer internals directly. That would make CLI behavior diverge from the public API and complicate later library parity checks.

Verification impact: `bun run test:cli -- --fixture basic-order` covers CLI output, while `bun test packages/api` covers the public API boundary against the same fixture.

## 2026-06-30: Depend on the Local CLI Workspace from the Root Package

Context: The Stage 0 and Stage 2 gates use `bunx temporal-explorer ...` from the repository root. Bun only exposed the workspace binary consistently after the root package declared the CLI workspace as a development dependency.

Decision: Keep `@temporal-explorer/cli` as a root development dependency and expose the root `temporal-explorer` binary through `packages/cli/src/bin.ts`. Keep command logic in `packages/cli/src/index.ts` so tests can import and cover the command surface without executing the process entrypoint side effect.

Alternatives considered: Invoke `bun packages/cli/src/bin.ts` in gates, leave the process entrypoint in `src/index.ts`, or rely on ambient workspace linking. Direct file invocation would not validate the product binary path, keeping the process side effect in `src/index.ts` made import-time coverage unrepresentative, and ambient linking was not reliable enough for the documented commands.

Verification impact: `bunx temporal-explorer --help`, package dry runs, and the CLI gates run through the same binary name expected by users while `bun test --coverage` can cover the importable command module.

## 2026-06-30: Keep Event History Parsing in `packages/history`

Context: Stage 3 requires Event History import to work without the static analyzer. The mapper and UI should consume semantic trace artifacts, not raw histories.

Decision: Add `packages/history` as the runtime parser boundary. It reads Temporal Event History JSON, collapses Activity schedule/start/close events into Activity executions and attempts, preserves raw event references, emits opaque payload references, and warns on unknown event types.

Alternatives considered: Parse histories in `packages/analyzer`, `packages/api`, or `packages/cli`. Analyzer placement would violate the static/runtime boundary. API placement would mix orchestration with parser internals. CLI placement would prevent library consumers from using the same trace path.

Verification impact: `bun test packages/history`, `bunx temporal-explorer history import ...`, trace schema validation, and the basic-order-history fixture gate exercise the parser independently from static analysis.

## 2026-06-30: Redact Payloads by Default in Trace Artifacts

Context: Stage 3 requires payload references with decoded previews disabled by default, while still preserving enough provenance to map runtime behavior later.

Decision: Trace payload entries store event ID, payload kind, and stable payload reference IDs with `decoded: false` and `redacted: true` by default. Parser configuration supports decoded previews only when explicitly requested with redaction disabled and a positive preview byte limit.

Alternatives considered: Decode `json/plain` payloads into trace artifacts by default. That would leak fixture and user data into artifacts and violates the MVP privacy requirement.

Verification impact: `bun test packages/history` and `bun run test:fixtures -- --fixture basic-order-history` assert that default trace payloads remain redacted.

## 2026-06-30: Make CLI Artifact JSON Prettier-Compatible Without Runtime Prettier

Context: CLI tests regenerate committed JSON artifacts. `JSON.stringify(value, null, 2)` formats short primitive arrays differently from Prettier, causing `bun run validate` to fail after tests.

Decision: Add a tiny CLI JSON formatter that keeps short primitive arrays inline while preserving stable two-space object formatting. Artifact writes use this formatter instead of adding Prettier as a CLI runtime dependency.

Alternatives considered: Add Prettier to the CLI runtime path or run Prettier as a post-write command. Both add unnecessary runtime weight and process coupling for a deterministic JSON shape.

Verification impact: `bun test packages/cli && bun run format:check` and `bun run validate` pass after artifact regeneration.

## 2026-06-30: Preserve Replay-Derived Evidence as Optional Mapping Evidence

Context: Stage 4 asks for a small replay research spike before hardening the source-aware overlay shape. The success fixture can map Activities by Activity type and command order, but repeated Activity calls, repeated timers, dynamic Activity dispatch, and patch markers may need stronger evidence later.

Decision: Keep replay out of the production MVP mapper, but preserve room in overlay evidence for future replay-derived facts. The MVP mapper must record concrete evidence kinds now: Activity type, command order, Workflow type, event references, source locations, and explicit unmapped reasons. Future replay support can add evidence such as replay command sequence index, timer command identity, dynamic dispatch resolution, and patch marker event references without making replay mandatory for basic imports.

Alternatives considered: Require replay for all mapping, or ignore replay-derived evidence entirely. Requiring replay would make Stage 4 depend on a later optional capability. Ignoring replay evidence would make repeated or dynamic cases harder to explain honestly later.

Verification impact: `bun test packages/mapper` will assert explicit evidence on every mapping. The Stage 4 success fixture can remain exact without replay, while ambiguous cases must be represented through confidence and evidence rather than hidden assumptions.

## 2026-06-30: Keep Documentation Rendering in `packages/renderers`

Context: Stage 5 needs deterministic Markdown and Mermaid outputs before the local UI exists. The renderer must consume committed artifacts and avoid becoming another analyzer or runtime parser.

Decision: Add `packages/renderers` as the documentation boundary. It accepts typed analysis, trace, and overlay documents, then produces stable Markdown and Mermaid files with relative source paths, redacted runtime summaries, and Prettier-compatible Markdown tables. `packages/api` validates artifact-shaped inputs before calling the renderer, while the CLI owns reading and writing documentation files.

Alternatives considered: Render docs directly in the CLI or generate docs from analyzer internals. CLI-only rendering would make library parity harder, and analyzer-backed rendering would bypass the artifact contract that the UI will also consume.

Verification impact: `bun test packages/renderers`, `bunx temporal-explorer docs ...`, `bunx temporal-explorer render ... --format mermaid`, `bun run snapshots:verify`, and `bun run validate` all exercise the same renderer output.

## 2026-06-30: Keep the Explorer UI Artifact-Driven

Context: Stage 6 requires a local SvelteKit UI that opens generated artifacts without becoming a second analyzer or sending project data to a remote service.

Decision: The explorer app loads `.temporal-explorer/analysis.json`, trace artifacts, and overlay artifacts through `apps/explorer/src/lib/server/artifacts.ts`, validates them with `packages/schemas`, and passes typed artifact data into the page. The Svelte page renders Workflow selection, overview, message, Activity, type, diagnostic, and inspector views from those artifacts only. The loader uses Node filesystem primitives instead of Bun globals so it works inside SvelteKit SSR.

Alternatives considered: Import analyzer or CLI internals directly into the UI, or read artifacts with Bun-specific APIs inside SvelteKit server modules. Analyzer imports would violate the artifact contract, and Bun globals were not available in the SvelteKit SSR runtime.

Verification impact: `bun test apps/explorer`, `bun run --cwd apps/explorer typecheck`, `bun run ui:e2e`, and `bun run ui:accessibility` all exercise the committed fixture artifacts through the UI loader.

## 2026-06-30: Verify `open` with Server Readiness and UI with Playwright

Context: `temporal-explorer open` must start a local explorer and cleanly stop it in non-interactive verification mode. The first full SvelteKit page render can take several seconds in development because Cinder source components are compiled on first request.

Decision: `startExplorerServer` verifies the local Vite readiness endpoint before returning the user-facing root URL. Playwright gates own full page rendering, hydration, tab interaction, inspector behavior, accessibility, and server teardown. This keeps the CLI startup check focused on process lifecycle without lengthening polling limits to hide UI compile work.

Alternatives considered: Use the root page as the server readiness endpoint or raise the readiness timeout. Root readiness conflated process startup with first page compilation, and raising polling limits would mask the distinction instead of assigning it to the UI gates.

Verification impact: `bunx temporal-explorer open --project fixtures/basic-order` verifies startup and shutdown. `bun run ui:e2e`, `bun run ui:accessibility`, and `bun run ui:server-lifecycle` verify the rendered artifact UI and local process lifecycle.

## 2026-07-07: Consume Cinder Through Public Package Entrypoints

Context: `@lostgradient/cinder@0.7.0` publishes server-safe public component subpaths for the Explorer shell components, including segmented controls and stat groups. The prior `$cinder-components` source alias was a temporary workaround for package-shape failures tracked upstream as stevekinney/cinder#580.

Decision: Import Cinder components through documented `@lostgradient/cinder/*` public subpaths and remove the downstream SvelteKit alias, TypeScript `allowImportingTsExtensions`, Vite `optimizeDeps.exclude`, and SSR `noExternal` workarounds. Keep the application on the package contract Cinder publishes rather than depending on its private source tree.

Alternatives considered: Keep the source alias after the upgrade or switch to the Cinder root barrel. Keeping the alias would preserve a workaround whose upstream blocker is closed. The root barrel would broaden the imported surface area without providing a benefit over the public component subpaths used by this app.

Verification impact: `bun run --cwd apps/explorer typecheck`, `bun test apps/explorer`, the Explorer build, and the UI Playwright gates verify that published Cinder package entrypoints work in SvelteKit SSR and browser hydration.

## 2026-06-30: Use Targeted Cinder Source Component Imports for the Explorer Shell

Superseded by the 2026-07-07 public-entrypoint decision above.

Context: Stage 6 requires `@lostgradient/cinder` for the local explorer UI. In this SvelteKit app, importing from the Cinder root package caused SSR snippet rendering failures through the published server build. Forcing the root source barrel pulled in unrelated editor and markdown surfaces and produced a slow, noisy first SSR compile.

Decision: Configure a SvelteKit `kit.alias` named `$cinder-components` that points to Cinder source component directories, and import only the components used by the explorer shell. Enable `allowImportingTsExtensions` because Cinder source modules use explicit `.ts` import specifiers. File the upstream package issue as stevekinney/cinder#580 rather than silently treating this as a permanent downstream workaround.

Alternatives considered: Keep root `@lostgradient/cinder` imports, force package conditions globally, or vendor/patch Cinder locally. Root imports failed SSR. Global condition changes pulled SvelteKit browser runtime into SSR. Vendoring or local patches would hide an issue in an owned package.

Verification impact: `bun run --cwd apps/explorer typecheck`, `bunx temporal-explorer open --project fixtures/basic-order`, and the Stage 6 Playwright gates pass with the targeted source imports.

## 2026-06-30: Keep the Graph as an Artifact Projection

Context: Stage 7 requires an interactive graph, timeline, History tab, Trace tab, filters, edge selection, and source-aware inspector without allowing the visual graph to become a second source of truth.

Decision: Add a typed graph projection module in `apps/explorer/src/lib/graph/projection.ts` that derives graph nodes, edges, timeline rows, runtime rows, state badges, source locations, and raw event references from validated `temporal-analysis/v1`, `temporal-trace/v1`, and `temporal-overlay/v1` artifacts. The Svelte page renders Svelte Flow, the timeline, edge list, History tab, Trace tab, and inspector from that projection.

Alternatives considered: Store graph state as another artifact or build the graph directly inside the Svelte template. A persisted graph artifact would duplicate semantic state already present in analysis, trace, and overlay files. Keeping the projection inline in the component would make it harder to test and easier for the graph, timeline, and inspector to drift.

Verification impact: `bun test apps/explorer` covers the projection model. `bun run ui:e2e:graph` verifies timeline-to-graph selection, graph-to-timeline filtering, edge selection, and inspector source/event evidence.

## 2026-06-30: Run ELK Layout Asynchronously Through a Worker

Context: Stage 7 calls for ELK layout and explicitly fails if graph layout runs synchronously on the main thread for large fixtures.

Decision: Use `elkjs` through `elk-api` with the packaged worker URL and run layout from a Svelte effect that updates replaceable node-position state when the worker returns. Static fallback positions keep the graph inspectable while layout is pending or if layout fails with a visible alert.

Alternatives considered: Hard-code positions or use `elkjs/lib/main` without a worker. Hard-coded positions would not prove the directed graph layout path. The non-worker path risks doing layout work on the browser main thread.

Verification impact: `bun run --cwd apps/explorer typecheck`, `bun run ui:e2e:graph`, and `bun run screenshots:verify` exercise the worker-backed layout path in the local Explorer.

## 2026-06-30: Generate Fixture Histories with Prettier-Compatible JSON

Context: Final MVP verification runs both fixture drift checks and repository-wide Prettier checks. The original history generator used plain `JSON.stringify`, which kept short numeric arrays inline. Prettier expands those arrays, so formatting the generated Event History by hand made `fixtures:verify-no-drift` fail.

Decision: Use Prettier inside `scripts/fixtures/generate-histories.ts` for generated history and provenance JSON before calculating the history content hash. This keeps the generator as the source of truth while making generated fixture artifacts compatible with `format:check`.

Alternatives considered: Ignore generated history fixtures in Prettier, format the fixture file manually after generation, or copy the CLI artifact JSON formatter into the fixture generator. Ignoring fixtures would weaken the final repository formatting gate. Manual post-formatting would keep drift checks red. Reusing the CLI formatter would preserve compact arrays but still disagree with Prettier.

Verification impact: `bun run fixtures:generate-histories`, `bun run fixtures:verify-no-drift`, `bun run format:check`, and `bun run validate` all pass with the same generated fixture text.

## 2026-07-01: Model Condition Timeouts as Implicit Timer Commands

Context: Stage 9A adds timers and conditions. `condition(predicate, timeout)` in the TypeScript SDK starts a durable timer that appears in Event History as TimerStarted plus TimerFired or TimerCanceled, even though the source contains no explicit `sleep`.

Decision: The analyzer emits two commands for a condition call with a timeout argument: a `condition` command for the predicate and a `timer` command for the implicit timeout timer, sharing the condition call's source location. Static timer counts therefore match runtime timer counts, and the timer-race overlay maps its canceled or fired timer to a real static node.

Alternatives considered: Emitting only a condition command would leave every condition-timeout runtime timer unmapped. Emitting only a timer command would hide the predicate that gates the wait.

Verification impact: `bun test packages/analyzer` asserts the command sequence `condition, timer, activity, activity` for `timerRaceWorkflow`; the timer-race fixture overlays map runtime timers with zero unmapped operations.

## 2026-07-01: Attach Signals to the Workflow That Registers the Handler

Context: `defineSignal` declarations are module-level, but the message surface is modeled per Workflow.

Decision: A signal joins a Workflow's `messageSurface.signals` when the Workflow function body registers it with `setHandler`. The definition site provides the payload types and source location; the registration site provides `handlerSource`. Signals defined but never registered are not attached in Stage 9A; a diagnostic for unregistered signals belongs to Stage 10.

Alternatives considered: Attaching every module-level signal to every exported Workflow in the file would fabricate message surfaces for Workflows that never handle those signals.

Verification impact: Analyzer tests cover registered signals (approval, timer-race) and dynamic signal names; the mapper maps runtime signal deliveries by name with `signal-name` evidence.

## 2026-07-01: Sequence Fixture Scenarios After a Settled First Workflow Task

Context: Multi-history fixtures need deterministic Event History event ordering. A signal sent immediately after `workflow.start` can race the first Workflow Task, moving WorkflowExecutionSignaled before TimerStarted between runs.

Decision: Fixture scenarios call `environment.sleep('10 seconds')` before signaling. On the time-skipping test server this lets pending Workflow Tasks complete (commands such as StartTimer land in history) while staying far below every fixture timer duration.

Alternatives considered: Signaling immediately (racy) or polling workflow state via queries (adds Query surface to fixtures that do not need it).

Verification impact: `bun run fixtures:verify-no-drift` regenerates approval and timer-race histories and compares byte-for-byte; the event sequences are stable across regenerations.

## 2026-07-01: Replay Spike Findings and Replay-Assisted Mapping Decision

Context: Stage 13 requires a spike answering whether replay can provide source-level precision that static analysis plus Event History cannot, covering repeated Activities, identical timers, dynamic dispatch, and patch markers. The spike (`scripts/replay/spike.ts`) replays committed fixture histories through `Worker.runReplayHistory` with an instrumented workflow interceptors module reporting through a `callDuringReplay` sink.

Findings:

- Dynamic dispatch resolution works. Replaying `fixtures/dynamic` captured `archiveRequest`, `prepareShipment`, `notifyWarehouse` — the resolved Activity types for `activities[step]` calls, in command order. Static analysis cannot produce these names.
- Branch outcome resolution works. Replaying `timer-race/signal-wins` captured `notifyApproved`; `timer-race/timeout` captured `notifyExpired`; `patched/patched-run` captured `newCharge`. Replay directly answers which branch executed.
- Command sequencing works. The interceptor observes one call per scheduled Activity or started timer, in an order that aligns with history command order, so repeated identical commands can be disambiguated by sequence index.
- Source attribution through stack traces does not work under Bun. The workflow VM reports `v8.promiseHooks.createHook is not available; stack trace collection will be disabled`, and captured frames are bundle-relative without source map application.

Decision: Replay-assisted mapping is worth building as an optional precision layer, keyed on interceptor **sequence and resolved-name evidence**, not stack traces. The mapper will accept optional replay evidence (`replay-command-sequence` kind) that upgrades `dynamic`/`ambiguous` mappings to `inferred` or `exact`. Source locations continue to come from static analysis. Replay stays optional: it requires local workflow code and a compatible SDK, and file-based imports must keep working without it.

Alternatives considered: Requiring replay for dynamic mapping (breaks history-without-source usage), or extracting file:line from replay stacks (unreliable under Bun, redundant with static sources).

Verification impact: `bun run replay:spike` exercises the capture path over four committed histories. Production `--replay` mapping will be gated by mapper tests when implemented alongside Stage 9H dynamic boundaries.

## 2026-07-01: Implement Stages 9B-9H as Layer Passes with Per-Slice Verification

Context: The construct slices share the same schema, analyzer, parser, mapper, and renderer files. Implementing slice-by-slice would rewrite each file up to seven times.

Decision: Design the full construct schema once (trace operations for updates, child Workflows, external signals, markers, continue-as-new, cancel requests; command kinds for children, external Workflows, patches, continue-as-new, cancellation scopes, dynamic dispatch), then implement each layer in one pass. Verification and progress accounting stay per-slice: every fixture has its own generated history, committed artifacts, `test:fixtures` assertions, and package tests.

Alternatives considered: Strict slice-at-a-time implementation (repeated churn on shared files) or one merged "Stage 9" gate (loses the plan's per-slice completion signals).

Verification impact: `bun run test:fixtures` runs 13 named fixture suites; each construct's acceptance is asserted against its own committed artifacts.

## 2026-07-01: Read Retry Counts from ActivityTaskStarted Attempts

Context: Temporal collapses server-side Activity retries — intermediate failed attempts never write events. A retrying Activity's history is Scheduled, then one Started event whose `attempt` field carries the true attempt number, then one terminal event.

Decision: Attempt entries take their number from `activityTaskStartedEventAttributes.attempt`, and coverage counts an Activity as retried when any attempt number exceeds one or multiple close events exist. The fixture generator normalizes `lastFailure` stack traces to repository-relative paths.

Verification impact: The retry fixture's `retry-success` trace shows one attempt entry with `attempt: 3` and coverage `retried: 1`; the `failure` trace shows a failed Activity and a failed execution.

## 2026-07-01: Treat Rejected Updates as Absent from History by Design

Context: Update validators reject before acceptance is written, so a rejected Update leaves no events. The update fixture's scenario sends one validator-rejected Update to prove it.

Decision: The trace model represents only accepted/completed/failed Updates. Documentation and the trace model state that validator-rejected Updates cannot be observed from Event History, mirroring how Queries are documented as not appearing in history.

Verification impact: The updates fixture history contains exactly two accepted/completed pairs; `test:fixtures` asserts completed and failed statuses and no third operation.

## 2026-07-01: Decode core_patch Marker Details as SDK Metadata

Context: Versioning support needs patch IDs, but payloads stay redacted by default.

Decision: The parser decodes only the `core_patch` marker's `patch-data` payload (`{"id":...,"deprecated":...}`), which is SDK protocol metadata, not user data. All other marker payloads remain references.

Verification impact: The patched fixture maps both markers to static `patched`/`deprecatePatch` calls by patch ID with exact confidence.

## 2026-07-01: Infer Cancellation Scope Observation by Source Containment

Context: Cancellation scopes produce no direct history events, but the report must explain which cleanup path ran.

Decision: A `cancellation-scope` static node is marked observed when any observed command's source range is contained in the scope's range. The evidence is structural (`scope-containment`), not runtime.

Verification impact: The cancellation overlay shows both scopes observed, the canceled `useResources` call skipped, and the non-cancellable `releaseResources` cleanup observed.

## 2026-07-01: Represent Dynamic Dispatch as Static Nodes with Dynamic Attribution

Context: `activities[step](...)` cannot be named statically, but runtime operations from it must not be dropped or left unexplained.

Decision: The analyzer emits a `dynamic` command node per dynamic call site (following proxy aliases through `as` casts), keeps the warning diagnostic, and the mapper attributes otherwise-unmatched Activity operations to that node with `dynamic` confidence and `dynamic-dispatch` evidence. Replay (per the Stage 13 decision) can later upgrade these mappings.

Verification impact: The dynamic overlay maps both runtime dynamic Activities with `dynamic` confidence and zero unmapped operations, and `TEA_DYNAMIC_ACTIVITY_CALL` appears in CLI, docs, and artifacts.

## 2026-07-01: Isolate CLI Tests from Committed Fixture Artifacts

Context: CLI tests previously wrote artifacts into the committed fixture directories. Once the api package's parity tests read the same files, turbo's parallel test execution raced: one suite rewrote `fixtures/basic-order/.temporal-explorer` while another read it.

Decision: CLI tests run every command against a temporary copy of the committed fixture (`copyFixture`). Committed artifacts are refreshed only by `bun run fixtures:regenerate-artifacts`. This supersedes the earlier "CLI tests regenerate committed JSON artifacts" decision.

Verification impact: `bun run validate` runs all suites concurrently without artifact races, and `git status` stays clean after any test run.

## 2026-07-01: Bound Turbo Test Concurrency Instead of Raising Test Timeouts

Context: Under full-suite load, single ts-morph analyses that take about two seconds in isolation exceeded bun's five-second test timeout, with a different suite failing on each run. Ten concurrent heavy suites oversubscribed the ten-core machine.

Decision: `validate` and `test` run turbo with `--concurrency=5`. Test timeouts stay at their defaults; oversized tests are split rather than extended (the analyzer construct tests and the api parity tests each perform one compiler analysis per test).

Alternatives considered: Raising bun's test timeout (masks slowness and violates the working agreement) or serializing all tests (needlessly slow).

Verification impact: `bun run validate` passes repeatably with all suites green.
