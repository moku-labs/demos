# Trivia

A Layer-3 Moku **consumer demo app**: a couch-multiplayer **party quiz** for 1–5 players (12 rounds
per match), built on **@moku-labs/web** (Preact SPA + island layer) and **@moku-labs/room** (a
standalone `@moku-labs/core` framework: shared screen + phone controllers over WebRTC, QR join), with
its **@moku-labs/room/server** Cloudflare signaling worker. One SPA whose **role is chosen by the URL**
(`/` = TV/stage, `/controller/:code` = phone).

## Design specs → `spec/` (read this first — it's what we're building)

The complete design (look, feel, every screen/element, game rules, the question pipeline) lives in
[`spec/`](./spec/) — **the single source of truth**. Start at [`spec/README.md`](./spec/README.md),
then [`spec/design-context.md`](./spec/design-context.md) (authoritative). The architecture, decisions,
plugin list, and risks are in [`.planning/context-trivia.md`](./.planning/context-trivia.md) (the
brainstorm output). **Planner/builder: reference `spec/` — do not re-search for the design.**

> **Stack (settled 2026-06-26; room→0.3.1 2026-06-27):** **@moku-labs/room@0.3.1** (a standalone
> `@moku-labs/core` framework — NOT the old 0.1.x plugin-pack), **@moku-labs/web@2.3.0**, **preact@10.29.3**. The app
> is **one `@moku-labs/web` SPA whose role is chosen by the URL** (`/` = TV/stage, `/controller/:code` =
> phone) + per-role room `createApp`s (`src/lib/room/`) + **one** `@moku-labs/room/server` Hub-DO worker
> (`src/server.ts` + `src/cloudflare/worker.ts`) that serves the SPA via `ASSETS` and brokers
> `serverSignaling`. **`@moku-labs/worker@0.15.0` is a direct dependency** — `src/server.ts` composes ONE
> worker app (atlas-style) with room's `hubPlugin` (room 0.3.1's `./server` exports the hub as a worker plugin):
> `server.hub.handle` is the runtime; `server.cli.{dev,deploy}` **generate `wrangler.jsonc`**.

## Package Manager

Use `bun` exclusively — never npm, yarn, or pnpm.

## Scripts

- `bun run build` — `scripts/build.ts`: bundle the web SPA → `dist/client` via the web app's `cli.build()`
- `bun run dev` — `scripts/dev.ts`: `server.cli.dev` generates `wrangler.jsonc`, cold-builds the client,
  runs `wrangler dev` over it (Hub DO + RATE_LIMIT KV + ASSETS), and incrementally rebuilds on change
- `bun run deploy` — `scripts/deploy.ts`: `server.cli.deploy` builds + generates config + provisions
  KV/DO + `wrangler deploy` (guided; `--ci` auto-confirms, `--delete` tears a stage down)
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
- **Linter:** ESLint 9 flat config + Biome (`eslint-config-biome` must be LAST)
- **TypeScript:** Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`;
  `jsx: react-jsx` + `jsxImportSource: preact` for the island/component layer
- **Imports:** Use `import type` enforced via `@typescript-eslint/consistent-type-imports`
- **JSDoc:** Required on all source exports with descriptions, params, returns, and examples
- **Web patterns:** `data-*` attributes only (no CSS classes), `@scope` / `@layer` encapsulation,
  design tokens, island architecture — see the **moku-web** skill

## Architecture

This is a **Layer-3 consumer app** — it composes existing Moku frameworks via `createApp`. It does
**not** define a framework (no `createCoreConfig` / `createCore`) and must **never** depend on
`@moku-labs/core` directly (web pulls it in transitively — that's fine).

**Three `createApp` instances compose side-by-side** (idiom I2, like `demos/tracker`):

1. **Web SPA — `@moku-labs/web`.** `src/spa.tsx` calls `createApp` (from `@moku-labs/web/browser`,
   `mode:"spa"`) over **one** route table (`src/routes.tsx`) + an island registry (`src/islands/`). `/`
   renders the TV/stage surface; `/controller/{code}` the phone. `src/app.ts` is the Node build
   composition (`buildPlugin`/`cliPlugin`/…). The game UI lives here — big-screen first, tap-friendly.
2. **Room client apps — `@moku-labs/room` (a standalone `@moku-labs/core` framework).** You `createApp`
   **from room itself** — there are **no `roomPlugins` arrays** (the 0.1.x plugin-pack is gone). The
   four engines (`transport`/`session`/`intent`/`sync`) are client-core defaults; an app adds one role
   facade + its game plugins:
   - **stage** (`src/lib/room/stage.ts`) = `createApp({ plugins: [stagePlugin, questionBankPlugin,
     scoringPlugin, languagePlugin, matchFlowPlugin] })` → `app.stage` (the authoritative host:
     `createRoom`, `qr`, `mutate`, `broadcast`, `onIntent`, `roster`).
   - **controller** (`src/lib/room/controller.ts`) = `createApp({ plugins: [controllerPlugin] })` →
     `app.controller` (a phone: `joinRoom`, `read`, `on`, `intent`, `requestWakeLock`).
   - Networking is **direct WebRTC DataChannels on the LAN** (`trystero`, bundled) with **QR join**
     (`qrcode`, bundled). All gameplay rides the `Wire` (intents/sync), never `emit`. **No TURN** — the
     design target is the home LAN. `createPlugin` comes from `@moku-labs/room` (never `@moku-labs/core`).
   - The **web↔room seam** is the `src/lib/room/` module singleton (idiom I5, like
     `tracker/lib/realtime.ts`): islands import its `startStage`/`startController`/`snapshot`/
     `subscribe`/`intent`/`onLifecycle`/`qr` surface; it owns the room apps (created only in the browser).
3. **Server — ONE `@moku-labs/worker` app composing room's `hubPlugin` (atlas-style; full app control).**
   `src/server.ts` = `createApp({ plugins: [storage, kv, d1, queues, durableObjects, hubPlugin, deploy, cli] })`
   from `@moku-labs/worker`, where **`hubPlugin`** is imported from `@moku-labs/room/server` (room 0.3.1's
   `./server` exports the hub as a `@moku-labs/worker` plugin + the `Hub` DO — it is **not** a server core).
   `server.hub.handle` is the **runtime** fetch (signaling WS → the per-room `Hub` DO / else → `ASSETS`);
   `server.cli.{dev,deploy}` (worker) **generate `wrangler.jsonc`** + run wrangler. Only `kv` (RATE_LIMIT) +
   `durableObjects` (Hub) are configured (deploy depends on all five resource plugins). `src/cloudflare/
   worker.ts` delegates `fetch` to `server.hub.handle` + re-exports the `Hub` DO. (`@moku-labs/room/server`
   ships no `./server` types → `src/server.ts`/`worker.ts` lean on a small ambient module in
   `declarations.d.ts` that types `hubPlugin`+`Hub` — drop it once room publishes `./server` types.)

The four custom Layer-3 room game plugins (`question-bank`, `scoring`, `language`, `match-flow`) live
in `src/plugins/{name}/` using **room's** re-exported `createPlugin` — never `@moku-labs/core`.

Follow **`demos/tracker`** (and the now-current **`demos/atlas`**, web 2.2.x) as the worked references
for app shape (multiple `createApp` instances, side-by-side frameworks, folder splits — all idiomatic).

## Dependency stack

`@moku-labs/room@0.3.1` + `@moku-labs/web@2.3.0` + `@moku-labs/worker@0.15.0` + `preact@10.29.3` +
`preact-render-to-string@6.7.0`; all four frameworks pin one aligned `@moku-labs/core@1.5.0`.
**`@moku-labs/worker@0.15.0` is a direct dependency** — `src/server.ts` composes ONE worker app (atlas-style)
with room's `hubPlugin` (`@moku-labs/room/server` 0.3.1 exports the hub as a worker plugin; worker is its
optional peer dep). `server.hub.handle` is the runtime; `server.cli.{dev,deploy}` generate `wrangler.jsonc`.
The **question bank** ships as build-authored JSON via @moku-labs/web's `collection` provider (new in 2.3.0):
`app.collection.write` in `scripts/build.ts`/`dev.ts` emits `bank/{lang}/{category}.json` → `dist/client/bank/**`
(served as `ASSETS`), and the room question-bank loader reads it via `loadCollectionShard` — NOT from `public/`.
`qrcode`/`trystero` are **bundled inside room** (not direct deps). Dev tooling tracks the latest
used by `demos/atlas` (biome/eslint/vitest/tsdown/wrangler).
The "latest of everything" directive holds — bump room first, then the rest, keeping `core` aligned.

## Game brief (the spec to build toward)

- **Players:** 1–5, sharing one screen. **Match:** 12 rounds.
- **Language:** group picks at the start — English (default), Russian always available.
- **Each round:** the active player picks a **category**, then answers a **question** from it.
- **Questions:** exactly **4 options**, text or image.
- **Steal:** a wrong answer passes the chance to the next player.
- **Scoring:** correct answers earn points.
- **Difficulty:** rises gradually — easy at the start, hardest by the final rounds.
- **Feel:** fast, social, looks great on the big screen, easy to tap on a phone.

These constants live in `src/config.ts` (`TRIVIA`) — the single source of truth the plugins read.

## Testing

- Vitest with unit + integration projects
- App-level tests: `tests/unit/` and `tests/integration/`
- Layer-3 plugin tests (if you add plugins): `src/plugins/[name]/__tests__/unit/` and
  `__tests__/integration/`
- 90% coverage threshold (`.tsx` island/component DOM glue is excluded — exercised via e2e)

## Moku Development Toolkit

This project uses the **moku** Claude Code plugin for development workflows.

### Commands (slash commands)

**Design:**
- `/moku:design "what to design"` — explore look/feel/screens and capture a reusable
  `design-context.md` before planning (recommended for any app with a UI).

**Planning:**
- `/moku:plan [create|update|add|migrate] [type] [args]` — 3-stage gated workflow. For this app,
  run `/moku:plan create app` to design the web client + room composition + worker server.

**Building:**
- `/moku:build [app|plugin] [spec-or-name]` — Build from specifications. Auto-detects what to build
  and resumes if partially built. For a web app, its final stage is the comprehensive E2E +
  visual-baseline gate.

**Testing:**
- `/moku:e2e` — comprehensively e2e-test the app in a real browser (Playwright) with visual baselines.

**Setup:**
- `/moku:init` — Initialize a new Moku project with full tooling (used to create this project).

### Skills (automatic context)

- **moku-core** — Architecture rules, factory chain, lifecycle, events, context tiers (`createApp`).
- **moku-room** — The couch-multiplayer framework: shared screen + phones, WebRTC, state sync, QR,
  the opt-in `./server` signaling tier.
- **moku-web** — Web patterns: Preact islands, CSS architecture (`@scope`, `@layer`, design tokens).
- **moku-plugin** — Plugin structure + complexity tiers, for authoring Layer-3 plugins.

### Agents (validation)

- **moku-spec-validator** — Moku Core spec compliance (layer separation, factory chain, events).
- **moku-plugin-spec-validator** — Plugin structure, tier, anti-patterns.
- **moku-jsdoc-validator** — JSDoc completeness on all exports.

### Typical Workflow

1. `/moku:design "fast social party trivia — big screen + phone controllers"` — capture the design.
2. `/moku:plan create app "..."` — design the app composition (web client + room + worker server).
3. `/moku:build app` — implement from the plan.
4. Author custom Layer-3 plugins for plugin-shaped concerns under `src/plugins/{name}/`.

## Monorepo notes

This demo lives inside the **`moku/demos`** monorepo (one git repo at the repo root — there is no
nested `.git` here, matching `tracker`/`atlas`). Commit from the repo root or this folder directly to
`main`; do not init a nested repo. `bun install` and all scripts run **from this folder**
(`cd demos/trivia`). `lefthook.yml` is present as config but git hooks are not installed in this
shared repo.

## Specification

For how things should be implemented, refer to the
[Moku Core specification](https://github.com/moku-labs/core/tree/main/specification).
