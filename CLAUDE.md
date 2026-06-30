# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development

```bash
bun run dev               # Start all dev servers (via turbo)
bun run build             # Build all workspaces (via turbo)
bun run clean             # Clean all build artifacts (via turbo)
```

### Workspace Filtering

```bash
bunx turbo run build --filter=@repo/server        # Build only server
bunx turbo run test --filter=@repo/shared          # Test only shared
bunx turbo run lint --filter=./apps/*              # Lint all apps
bunx turbo run typecheck --filter=...@repo/shared  # Typecheck shared + dependents
```

### Testing

```bash
bun run test              # Run all tests across all workspaces
bun test --filter apps/server  # Run tests in specific workspace directory
```

### Code Quality

```bash
bun run lint              # Lint all workspaces (via turbo)
bun run lint:fix          # Auto-fix lint errors across all workspaces
bun run typecheck         # TypeScript checking across all workspaces
bun run format            # Format all files with Prettier (root-level)
bun run format:check      # Check formatting without changes
bun run validate          # Full validation: lint + typecheck + test
```

### Utilities

```bash
bun run clean             # Clean build artifacts across all workspaces
```

## Architecture Overview

### Monorepo Structure

This is a Turborepo monorepo using Bun workspaces. Code is organized into:

- `apps/` -- Deployable applications (leaf nodes of the dependency graph)
- `packages/` -- Shared libraries and configuration (consumed by apps and other packages)

### Workspaces

| Workspace                           | Type             | Purpose                                        |
| ----------------------------------- | ---------------- | ---------------------------------------------- |
| `apps/server`                       | Application      | Example Bun server application                 |
| `packages/shared`                   | Internal package | Shared utilities (Just-in-Time, no build step) |
| `packages/typescript-configuration` | Configuration    | Shared TypeScript compiler options             |

### Key Conventions

1. **Workspace naming**: All workspaces use the `@repo/` namespace prefix.
2. **Internal packages pattern**: `packages/shared` exports TypeScript directly (no build step). Consuming apps transpile it via their own bundler.
3. **Dependency protocol**: Internal dependencies use `workspace:*` in package.json.
4. **Task orchestration**: All tasks run through Turborepo (`turbo.json`) for caching and dependency-aware execution.
5. **Configuration sharing**: TypeScript configs extend from `@repo/typescript-configuration`. Oxlint and Prettier configs live at the root and are discovered via directory traversal.

### Turbo Pipeline

Tasks are defined in `turbo.json`. Key relationships:

- `build` depends on upstream builds (`^build`)
- `lint`, `typecheck`, `test` depend on upstream builds for type resolution
- `dev` is persistent (long-running watcher), never cached
- `format` is NOT a turbo task -- it runs from root via Prettier

### Git Hooks Architecture

Hooks are configured in `lefthook.yml` and implemented as Bun TypeScript files under `scripts/hooks/`:

- **pre-commit** (`lefthook.yml`, piped/sequential): formats staged files with Prettier, runs `oxlint --fix` on staged files, blocks staged conflict markers, and checks `bun.lock` is staged when a `package.json` changes. Fast by design; skipped during merge/rebase.
- **pre-push** (`lefthook.yml`): runs full `bun run validate` (lint, typecheck, test, build, format check across all workspaces via turbo); skipped in CI.
- **post-checkout** (`scripts/hooks/post-checkout.ts`): installs deps when dependencies changed; surfaces config changes across workspaces. Silent when nothing actionable changed.
- **post-merge** (`scripts/hooks/post-merge.ts`): installs/cleans when dependencies or config changed; flags leftover conflict markers. Silent when nothing actionable changed.

Hooks print only on failure (`output: [failure, execution_out]` in `lefthook.yml`), so a clean commit/push stays quiet. The TypeScript hook scripts use `chalk` for color, `change-case` for headings, and Bun's `$` and `Bun.write` for shell/IO.

### Claude Code Hooks

`.claude/settings.json` wires up two project-level Claude Code hooks (scripts in `.claude/hooks/`):

- **format-on-edit** (`PostToolUse` on `Edit`/`Write`): runs `prettier --write --ignore-unknown` on the file Claude just edited, so edits always match the project style and never trip the format gate. Fail-safe — no-ops if Prettier isn't installed yet.
- **protect-env** (`PreToolUse` on `Write`): blocks writes to `.env` / `.env.*` (except `.env.example`) so secrets aren't clobbered. Edit those files manually.

Both scripts exit 0 (no-op) when their dependencies are missing, so a freshly cloned template never breaks a session.

### Types

There is no shared `src/types.ts` in this template. Add shared or domain-specific types near their modules as needed, or create a dedicated types package in `packages/`.

## Development Patterns

### Adding a New Workspace

Use `/add-workspace` or manually create in `apps/` (for applications) or `packages/` (for shared libraries). Each workspace needs:

- `package.json` with `@repo/` namespaced name and workspace scripts
- `tsconfig.json` extending `@repo/typescript-configuration`
- Source files in `src/`

Run `bun install` after adding to link the workspace.

### Adding Dependencies

Use `/add-dependency` or:

- **Workspace dependency**: `cd apps/server && bun add <package>`
- **Internal dependency**: Add `"@repo/shared": "workspace:*"` to the workspace's package.json, then `bun install`
- **Root dev dependency**: `bun add -d -w <package>` (for tools like prettier, turbo)

### Adding New Features

1. **Environment variables**: Add to `.env.example` first, then update the schema in the relevant workspace.
2. **Types**: Shared/reusable types go in `packages/shared` or a dedicated types package; domain-specific types live near their modules.

### Cross-Workspace Imports

Import from internal packages by their package name:

```typescript
import { greet } from '@repo/shared';
```

### Testing Approach

- Tests use Bun's built-in test runner with `describe`, `it`, `expect`.
- Test files are typically colocated with sources using the `.test.ts` suffix.
- Oxlint rules are relaxed for test files (`*.test.ts`, `*.spec.ts`, `test/**`, `__tests__/**`). You can use `any`, non-null assertions, unused variables, and other patterns that would normally be flagged.
- Tests run per-workspace via turbo for caching and parallelism.

### Import Organization

Prettier plus import sorting keeps imports consistent. A common order is:

1. Bun built-ins (e.g., `import { file, write } from 'bun'`)
2. Node built-ins (e.g., `import { readFile } from 'node:fs'`)
3. External packages (e.g., `import { z } from 'zod'`)
4. Internal workspace packages (e.g., `import { greet } from '@repo/shared'`)
5. Relative imports (e.g., `./local-module`)

## Bun-Specific Considerations

- Always use `bun` commands, not `npm` or `yarn`.
- The lockfile in this repo is `bun.lock`.
- Bun provides native TypeScript execution without precompilation.
- Use `bunx` for one-off package execution (like `npx`).

### Prefer Bun Built-ins Over Node

When possible, use Bun's native APIs instead of Node.js equivalents. Bun's APIs are optimized for performance and often have a simpler interface.

| Task          | Use (Bun)                                | Avoid (Node)                     |
| ------------- | ---------------------------------------- | -------------------------------- |
| Read file     | `Bun.file(path).text()`                  | `fs.readFileSync(path, 'utf-8')` |
| Write file    | `Bun.write(path, data)`                  | `fs.writeFileSync(path, data)`   |
| HTTP server   | `Bun.serve()`                            | `http.createServer()` or Express |
| Hashing       | `Bun.hash()` or `new Bun.CryptoHasher()` | `crypto.createHash()`            |
| Spawn process | `Bun.spawn()` or `Bun.$`                 | `child_process.spawn()`          |
| Sleep         | `Bun.sleep(ms)`                          | `setTimeout` with promisify      |
| Environment   | `Bun.env.VAR`                            | `process.env.VAR`                |
| Glob          | `Bun.Glob`                               | `glob` package                   |

When a Bun equivalent doesn't exist or Node's API is more appropriate for the use case, use the `node:` prefix for clarity (e.g., `import { join } from 'node:path'`).

### Configuration Notes

- **bunfig.toml**: Build targets Bun with sourcemaps and minification.
- **TypeScript**: Uses shared configs from `@repo/typescript-configuration`; Bun types included in server configs.
- **Oxlint**: Rust-based linter with built-in TypeScript, promise, unicorn, and import plugins. Type-aware rules enabled via `--type-aware --tsconfig ./tsconfig.json`. Import sorting and unused import removal handled by Prettier via `prettier-plugin-organize-imports`. Test files have relaxed rules.
- **Testing**: You can run tests in parallel via `bun test --parallel`.

## Turborepo Considerations

- **Caching**: Turbo caches task results. Same inputs = cache hit. Run `bun run build` twice -- second run should be near-instant.
- **Filtering**: Use `--filter` to target specific workspaces: `bunx turbo run build --filter=@repo/server`.
- **Dependencies**: `^build` in `dependsOn` means "wait for my dependencies to build first."
- **Persistent tasks**: `dev` is marked persistent -- it runs indefinitely and cannot be depended on.
- **Environment variables**: Variables declared in `turbo.json` `env` affect cache keys. Change `NODE_ENV` -> cache miss for `build`. Change `CI` -> cache miss for `test`.
