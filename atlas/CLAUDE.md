# Atlas

A Layer-3 Moku **consumer demo app** — the **Tracker redesign** — built on **@moku-labs/web** (client / island layer) and **@moku-labs/worker** (Cloudflare server: Durable Objects, Queues, R2, D1, KV).

Atlas is a fresh reimplementation of the `tracker/` demo around the winning "Atlas" design concept. It lives beside `tracker/` as its own **self-contained** demo (own `package.json`, lockfile, build, deploy) — see the monorepo `CLAUDE.md` one level up.

## Package Manager

Use `bun` exclusively — never npm, yarn, or pnpm.

## Scripts

- `bun run build` — Build with tsdown (placeholder app entry; the real web/worker build replaces it during `/moku:build`)
- `bun run typecheck` — `tsc --noEmit`
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
2. **Server — `@moku-labs/worker`.** The Cloudflare Worker side (Durable Objects, Queues, R2, D1, KV) plus a hand-assembled `worker.ts` default export calling `app.server.handle(request, env, ctx)`, with `wrangler.jsonc` and `@cloudflare/workers-types`. **Deferred** — design it with `/moku:plan create app`.

Custom Layer-3 plugins (plugin-shaped concerns) live in `src/plugins/{name}/` using the framework's re-exported `createPlugin` — never `@moku-labs/core`. Scaffold that folder only when a concern is genuinely plugin-shaped.

> The init tsconfig is the canonical minimal config. The web/worker-specific compiler options
> (preact JSX — `jsx: "react-jsx"` + `jsxImportSource: "preact"`, the `DOM` lib, and
> `@cloudflare/workers-types`) are added during `/moku:build` once `.tsx` routes/islands and the
> worker entry exist — mirroring how `tracker/` evolved its tsconfig.

## Testing

- Vitest with unit + integration projects
- App-level tests: `tests/unit/` and `tests/integration/`
- Layer-3 plugin tests (if you add plugins): `src/plugins/[name]/__tests__/unit/` and `__tests__/integration/`
- 90% coverage threshold

## Moku Development Toolkit

This project uses the **moku** Claude Code plugin for development workflows.

### Commands (slash commands)

**Design (already finalized):**
- The Atlas design is **done** — the design-context spec lives at `/Users/alex/Projects/moku/assets/tracker-v2/design-context.md` (with the runnable prototype `index.html` beside it). Treat it as a **spec, not source**: reimplement to plugin conventions, never copy the demo code or its bugs. `/moku:design` only needs re-running to revise the look.

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
- **moku-worker** — Cloudflare backend: Durable Objects, Queues, R2, D1, KV.

> Server-side primitives (Durable Objects, Queues, R2, D1, KV, HTTP routing) come from `@moku-labs/worker` — see its README for the `endpoint(...)` routing model and the `worker.ts` default-export pattern. Its build-time deploy/CLI surface is imported separately from `@moku-labs/worker/cli` and must never enter the deployed Worker bundle.

### Agents (validation)

- **moku-spec-validator** — Moku Core spec compliance (layer separation, factory chain, events).
- **moku-plugin-spec-validator** — Plugin structure, tier, anti-patterns.
- **moku-jsdoc-validator** — JSDoc completeness on all exports.

### Typical Workflow

1. `/moku:plan create app --context /Users/alex/Projects/moku/assets/tracker-v2/design-context.md` — design the web + worker composition from the finalized Atlas design (the design step is already done).
2. `/moku:build app` — implement from the plan. Reimplement the design to plugin conventions (moku-web islands, `@scope` / `@layer`, `data-*`, tokens) — never copy the prototype source.
3. Author custom Layer-3 plugins for plugin-shaped concerns under `src/plugins/{name}/` via the framework's `createPlugin`.

## Specification

For how things should be implemented, refer to the [Moku Core specification](https://github.com/moku-labs/core/tree/main/specification).
