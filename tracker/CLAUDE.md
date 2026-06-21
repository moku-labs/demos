# Tracker

A Layer-3 Moku **consumer demo app**, built on **@moku-labs/web** (client / island layer) and **@moku-labs/worker** (Cloudflare server: Durable Objects, Queues, R2, D1, KV).

## Package Manager

Use `bun` exclusively — never npm, yarn, or pnpm.

## Scripts

- `bun run build` — Build with tsdown
- `bun run lint` — Biome check + ESLint
- `bun run lint:fix` — Auto-fix lint issues
- `bun run format` — Format with Biome
- `bun run test` — Run all tests (vitest)
- `bun run test:unit` — Unit tests only
- `bun run test:integration` — Integration tests only
- `bun run test:coverage` — Tests with coverage

## Code Style

- **Formatter:** Biome (2-space indent, double quotes, semicolons, no trailing commas)
- **Linter:** ESLint 9 flat config + Biome (biome-config-biome must be LAST)
- **TypeScript:** Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- **Imports:** Use `import type` enforced via `@typescript-eslint/consistent-type-imports`
- **JSDoc:** Required on all source exports with descriptions, params, returns, and examples

## Architecture

This is a **Layer-3 consumer app** — it composes existing Moku frameworks via `createApp`. It does **not** define a framework (no `createCoreConfig` / `createCore`) and must **never** depend on `@moku-labs/core` directly.

Two frameworks compose side-by-side:

1. **Client — `@moku-labs/web`.** `src/index.ts` calls `createApp` for the request / island layer. This is the only entry wired today.
2. **Server — `@moku-labs/worker`.** The Cloudflare Worker side: its own `createApp` plus a hand-assembled `worker.ts` default export calling `app.server.handle(request, env, ctx)`, with `wrangler.jsonc` and `@cloudflare/workers-types`. **Deferred** — design it with `/moku:plan create app`.

Custom Layer-3 plugins (plugin-shaped concerns) live in `src/plugins/{name}/` using the framework's re-exported `createPlugin` — never `@moku-labs/core`. Scaffold that folder only when a concern is genuinely plugin-shaped.

## Testing

- Vitest with unit + integration projects
- App-level tests: `tests/unit/` and `tests/integration/`
- Layer-3 plugin tests (if you add plugins): `src/plugins/[name]/__tests__/unit/` and `__tests__/integration/`
- 90% coverage threshold

## Moku Development Toolkit

This project uses the **moku** Claude Code plugin for development workflows.

### Commands (slash commands)

**Planning:**
- `/moku:plan [create|update|add|migrate] [type] [args]` — 3-stage gated workflow. For this app, run `/moku:plan create app` to design the full web + worker composition.

**Building:**
- `/moku:build [app|plugin] [spec-or-name]` — Build from specifications. Auto-detects what to build and resumes if partially built.

**Setup:**
- `/moku:init` — Initialize a new Moku project with full tooling (used to create this project).

### Skills (automatic context)

- **moku-core** — Architecture rules, factory chain, lifecycle, events, context tiers (`createApp` usage).
- **moku-plugin** — Plugin structure + complexity tiers, for authoring Layer-3 plugins.
- **moku-web** — Web patterns: Preact islands, CSS architecture (@scope, @layer, design tokens).

> Server-side primitives (Durable Objects, Queues, R2, D1, KV, HTTP routing) come from `@moku-labs/worker` — see its README for the `endpoint(...)` routing model and the `worker.ts` default-export pattern. Its build-time deploy/CLI surface is imported from the package root `@moku-labs/worker` (the `./cli` subpath was removed in 0.11.0); the node-only deploy/CLI plugins are tree-shaken out of the deployed Worker bundle unless listed in `createApp({ plugins })`.

### Agents (validation)

- **moku-spec-validator** — Moku Core spec compliance (layer separation, factory chain, events).
- **moku-plugin-spec-validator** — Plugin structure, tier, anti-patterns.
- **moku-jsdoc-validator** — JSDoc completeness on all exports.

### Typical Workflow

1. `/moku:plan create app "..."` — design the app composition (web client + worker server).
2. `/moku:build app` — implement from the plan.
3. Author custom Layer-3 plugins for plugin-shaped concerns under `src/plugins/{name}/` via the framework's `createPlugin`.

## Specification

For how things should be implemented, refer to the [Moku Core specification](https://github.com/moku-labs/core/tree/main/specification).
