# Temporal Workflow Explorer

A local-first developer tool that explains Temporal TypeScript Workflows from
two directions: static source analysis answers _what can this Workflow do?_,
and runtime Event History analysis answers _what did this specific Workflow
Execution actually do?_

```text
Explain this Temporal Workflow execution using the source code as the map.
```

Everything runs locally. Source code, Event Histories, and payloads never
leave your machine, and payload previews are redacted by default.

## Quick Start

```bash
bun add -d temporal-explorer

# Inspect a conventional Temporal TypeScript project with no configuration
bunx temporal-explorer list
bunx temporal-explorer show orderWorkflow

# Import an Event History and explain the execution against the source
bunx temporal-explorer history import --file history.json
bunx temporal-explorer trace orderWorkflow --history history
bunx temporal-explorer report --trace history

# Generate committable docs, SDK-oriented declarations, and CI diagnostics
bunx temporal-explorer docs
bunx temporal-explorer types
bunx temporal-explorer check

# Open the local artifact-driven explorer UI
bunx temporal-explorer open
```

## What It Does

- **Static analysis** discovers Workflows, Activities, Signals, Queries,
  Updates (with validators), timers, conditions, child Workflows, external
  Workflow signals, cancellation scopes, `continueAsNew`, versioning patches,
  and dynamic Activity dispatch — each with source locations and an explicit
  confidence level. Determinism problems (nondeterministic APIs, Node imports
  in Workflow code, Query handler mutations, duplicate message names) surface
  as diagnostics with stable codes.
- **Event History import** collapses raw events into semantic runtime
  operations: Activity executions with true attempt counts, Signal
  deliveries, timer outcomes, Update lifecycles, child Workflows, markers,
  cancellations, and continue-as-new rollovers.
- **The execution overlay** joins both sides: every runtime operation maps to
  a static node with recorded evidence, or is explicitly unmapped. Skipped
  branches, retried Activities, canceled timers, and executed version
  branches are all visible. Optional `--replay` uses the Temporal SDK replayer
  to resolve dynamic dispatch with higher confidence.
- **Generated documentation** is deterministic and safe to commit: Markdown
  pages, Mermaid diagrams, and real `.d.ts` declaration files that preserve
  imports of your own types.
- **Live connections** (optional) list Workflow Executions and fetch Event
  Histories from configured Temporal instances into the same artifact model
  as file imports.
- **Aggregate analysis** summarizes many executions: retry hot spots, failure
  counts, message frequencies, timer outcomes, hot paths, and rare branches.
- **The local UI** (`temporal-explorer open`) renders validated JSON
  artifacts: workflow overviews, message surfaces, an interactive Svelte
  Flow + ELK graph, semantic timelines, and a source-aware trace inspector.

## What It Looks Like

The interactive graph overlays runtime evidence on the static control-flow
structure: each node is colored by what actually happened—`completed`, `failed`,
`not taken`—so one picture answers both _what can this Workflow do?_ and _what
did this execution do?_ Run `bun run explorer:fixtures` to browse every example
Workflow below in the local UI, or `temporal-explorer open` against your own
project.

![A Workflow with a loop containing a branch, a Promise.all region, and a try/catch, rendered as nested regions](https://raw.githubusercontent.com/stevekinney/temporal-explorer/main/docs/screenshots/nested-orchestration.png)

_One Workflow exercising a loop, a branch, a `Promise.all` region, and a
`try`/`catch`—drawn as nested regions with per-node runtime state._

<table>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/stevekinney/temporal-explorer/main/docs/screenshots/switch-routing.png" alt="A switch statement routing to fulfillment activities"><br><sub><b><code>switch</code></b>: a decision fans out to clause arms that converge on a join.</sub></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/stevekinney/temporal-explorer/main/docs/screenshots/while-loop.png" alt="A while loop with a repeat back-edge"><br><sub><b>loop</b>: a <code>repeat</code> back-edge closes the loop region.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/stevekinney/temporal-explorer/main/docs/screenshots/try-catch-finally.png" alt="A try/catch/finally with a failed activity routing to the handler"><br><sub><b><code>try</code>/<code>catch</code>/<code>finally</code></b>: a failed Activity routes through the handler, then the finalizer runs on the way out.</sub></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/stevekinney/temporal-explorer/main/docs/screenshots/race.png" alt="A Promise.race between an activity and a timer"><br><sub><b><code>Promise.race</code></b>: parallel branches fork from the region and meet at a join.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/stevekinney/temporal-explorer/main/docs/screenshots/dynamic-parallel.png" alt="A dynamic fan-out over a list of items"><br><sub><b>dynamic fan-out</b>: one template branch stands in for the <code>&times;N</code> runtime executions.</sub></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/stevekinney/temporal-explorer/main/docs/screenshots/continue-as-new.png" alt="A continue-as-new terminal looping back to the workflow entry"><br><sub><b><code>continueAsNew</code></b>: the terminal loops back to the Workflow entry instead of completing.</sub></td>
  </tr>
</table>

> [!TIP]
> These images are generated from the committed fixture artifacts with
> `bun run ui:screenshot-fixtures --out docs/screenshots --fit`, so they stay in
> sync with the renderer.

## Configuration (optional)

Conventional projects need no configuration. When defaults are wrong, create
`temporal-explorer.config.ts`:

```ts
import { defineConfig } from 'temporal-explorer';

export default defineConfig({
  temporal: { workflowGlobs: ['src/workflows/**/*.ts'] },
  diagnostics: { TEA_DYNAMIC_ACTIVITY_CALL: 'error' },
  connections: {
    local: { address: 'localhost:7233', namespace: 'default' },
  },
  history: {
    payloads: { decode: false, redact: ['password', 'token'], maxPreviewBytes: 2048 },
  },
});
```

## Library Usage

Everything the CLI does is a typed library function first:

```ts
import {
  analyzeWorkflowFiles,
  createExecutionOverlay,
  importHistoryFromFile,
} from 'temporal-explorer';

const analysis = await analyzeWorkflowFiles({
  projectRoot: process.cwd(),
  tsconfig: 'tsconfig.json',
  workflowFiles: ['src/workflows/order.workflow.ts'],
});
const trace = await importHistoryFromFile({ file: 'history.json' });
const overlay = createExecutionOverlay({
  analysis: analysis.value,
  trace: trace.value,
  workflowName: 'orderWorkflow',
});
```

See `examples/` for runnable direct-file, Event History, and project-level
usage.

## Artifacts Are the Contract

Every artifact (`temporal-analysis/v1`, `temporal-trace/v1`,
`temporal-overlay/v1`) is schema-validated before it is written, and JSON
Schema documents are checked in under `packages/schemas/json-schema/` for
non-TypeScript tools. See `docs/schema-compatibility.md`.

## Repository Layout

| Workspace            | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `apps/explorer`      | SvelteKit local UI (Cinder + Svelte Flow + ELK) |
| `packages/api`       | Public library surface                          |
| `packages/cli`       | `temporal-explorer` command layer               |
| `packages/schemas`   | Zod artifact schemas + JSON Schema emission     |
| `packages/analyzer`  | ts-morph static analysis                        |
| `packages/history`   | Event History parsing + live connections        |
| `packages/mapper`    | Source-to-runtime overlay + aggregate analysis  |
| `packages/renderers` | Markdown, Mermaid, and `.d.ts` renderers        |
| `fixtures/`          | Real generated fixture projects and histories   |

## Development

```bash
bun install
bun run validate                     # typecheck + lint + test + build + format
bun run fixtures:generate-histories  # regenerate fixture histories (real Temporal runs)
bun run fixtures:regenerate-artifacts
bun run test:live                    # live-connection integration tests (starts a dev server)
bun run ui:e2e                       # Playwright gates for the local UI
bun run release:dry-run              # build dist bundles and pack the tarball
```

Implementation history, decisions, and verification logs live under
`docs/implementation/`.
