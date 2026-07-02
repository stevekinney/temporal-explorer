# Artifact Schema Compatibility Policy

Temporal Workflow Explorer emits three JSON artifact kinds, each carrying an
explicit `schemaVersion`:

| Artifact kind     | Current version        |
| ----------------- | ---------------------- |
| Static analysis   | `temporal-analysis/v1` |
| Runtime trace     | `temporal-trace/v1`    |
| Execution overlay | `temporal-overlay/v1`  |

## Contract

- Every artifact validates against its runtime Zod schema before it is
  written; the CLI refuses to write invalid artifacts.
- Checked-in JSON Schema documents are emitted from the same Zod schemas into
  `packages/schemas/json-schema/` (`bun run schema:emit-json-schema`, with
  `--check` as the drift gate) so non-TypeScript tools can validate artifacts
  independently.
- Consumers reject unusable artifacts with stable failure codes instead of
  best-effort parsing:
  - `TES_MISSING_SCHEMA_VERSION` — the artifact has no `schemaVersion`.
  - `TES_UNSUPPORTED_SCHEMA_VERSION` — the version is unknown to this build;
    newer artifacts require upgrading `temporal-explorer`.
  - `TES_SCHEMA_VALIDATION_FAILED` — the version is supported but the document
    violates its schema.

## Evolution rules

- Additive, optional fields and new union members may land within a version.
  Validators are strict about unknown object keys, so additions still require
  regenerating committed fixture artifacts in the same change.
- Removing or renaming fields, changing field meanings, or restricting
  accepted values requires a new version (for example `temporal-analysis/v2`)
  plus a migration helper and fixture coverage for both versions until the
  old version is retired.
- Version bumps and their migrations are recorded in
  `docs/implementation/decisions.md`.
