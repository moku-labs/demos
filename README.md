# Tracker

A real-time **kanban board** built to prove **[`@moku-labs/worker`](https://www.npmjs.com/package/@moku-labs/worker)** works — composed side-by-side with **[`@moku-labs/web`](https://www.npmjs.com/package/@moku-labs/web)** in a single Cloudflare Worker.

Columns of draggable cards, persisted server-side, synced live across every open tab, with a visible **"Worker Activity" panel** so you literally watch the worker's primitives fire. No accounts — boards are shared by URL.

> **Audience:** end users use the board; **developers are the real audience**, evaluating the worker. Every one of the five worker resource primitives (D1, Durable Objects, Queues, KV, R2) is exercised on a real user action.

## What it proves — worker feature → capability map

| Worker primitive | Plugin | Role in Tracker |
|---|---|---|
| **D1** | `d1` | Durable source of truth — boards, columns, cards, activity, attachment metadata |
| **Durable Objects** | `durableObjects` | One `Board` instance per board id — live WebSocket fan-out to every open tab |
| **Queues** | `queues` | Async activity feed — card events are enqueued off the request path, drained into D1 + broadcast |
| **KV** | `kv` | Board index for fast home-page reads (D1 fallback on a miss) |
| **R2** | `storage` | Card attachment blobs (downloaded as `Content-Disposition: attachment` — never inline-rendered) |

All five are composed via `pluginConfigs` and orchestrated by one custom Layer-3 plugin, [`tracker`](src/plugins/tracker/README.md).

## The proof loop — drag a card

```
 board-dnd island ──optimistic move──▶ POST /api/boards/{id}/cards/{cid}/move
        │                                        │
        │                              server endpoint → tracker.moveCard(env, …)
        │                                        │
        │                   ┌────────────────────┼─────────────────────┐
        │                 D1 UPDATE          Queues.send          DO /broadcast
        │                 (persist)        (ACTIVITY_QUEUE)      (Board instance)
        │                                        │                     │
        │                              queue consumer            WebSocket push
        │                          tracker.recordActivity              │
        │                          D1 INSERT + DO broadcast            ▼
        ▼                                        │            lib/realtime onPatch
  (every other tab) ◀───────WebSocket──────────┴──────────────▶ islands reconcile
```

A change in one tab reaches every other tab over the Durable Object's WebSocket, and the Activity panel updates everywhere from the queue consumer.

## Architecture

One Cloudflare Worker serves both sides. `src/worker.ts` branches every request:

- `/api/*` and `/ws/*` → `app.server.handle(...)` (the `tracker` endpoints + the Board DO upgrade)
- everything else → `env.ASSETS.fetch(...)` — the built web client (Cloudflare **Static Assets**)

```
src/
  worker.ts        Worker entry — createApp(@moku-labs/worker) + CF default export { fetch, queue }
  board.ts         Board Durable Object — WebSocket hibernation + fan-out
  schema.sql       D1 schema (reference; applied copy in migrations/0001_init.sql)
  plugins/tracker/ Custom Layer-3 plugin — the board domain orchestrator over D1/KV/Queues/R2/DO

  app.ts           Web client — Node build composition (@moku-labs/web; mode "spa")
  spa.tsx          Web client — browser bundle entry
  routes.tsx       Route table: "/" board list, "/b/{id}" board view
  islands/         board-list · board (drag/edit/delete/attach + live patches) · activity-panel
  components/      Preact views (+ colocated @scope CSS)
  lib/             api.ts (REST client) · realtime.ts (WebSocket manager) · types.ts (shared types)
  styles/          main.css (@layer) + tokens/reset/base/components/animations/utilities
```

The client and server graphs never cross at runtime — a [bundle-safety test](tests/integration/bundle-safety.test.ts) statically asserts the browser entry never imports `@moku-labs/worker`, `worker.ts`, `board.ts`, or the `tracker` plugin.

## Develop

```sh
bun install
bun run dev          # builds the web client → dist/client, then `wrangler dev` (worker + assets + D1/DO/Queue/R2 locally)
```

`wrangler dev` runs the full app locally (Miniflare emulates D1/DO/Queues/KV/R2). Apply the schema to the local D1 first:

```sh
bunx wrangler d1 migrations apply tracker --local
```

### Scripts

| Script | Does |
|---|---|
| `bun run build` | Build the web client → `dist/client` (via `app.cli.build()`) |
| `bun run build:worker` | `wrangler deploy --dry-run` — bundle + validate the worker offline |
| `bun run dev` | Build the client, then `wrangler dev` (full local app) |
| `bun run deploy` | Build the client, then `wrangler deploy` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` / `lint:fix` | Biome + ESLint |
| `bun run test` / `test:coverage` | Vitest (unit + integration); coverage gate |

## Deploy

A single `wrangler deploy` ships the worker and uploads `dist/client` as Static Assets.

1. **Create the resources** and put their ids into [`wrangler.jsonc`](wrangler.jsonc) (replace the `REPLACE_WITH_*` placeholders):
   ```sh
   bunx wrangler d1 create tracker
   bunx wrangler kv namespace create BOARDS_KV
   bunx wrangler r2 bucket create tracker-attachments
   bunx wrangler queues create tracker-activity
   ```
2. **Apply the D1 schema:** `bunx wrangler d1 migrations apply tracker --remote`
3. **Deploy:** `bun run deploy`

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) validates every PR (typecheck · lint · test+coverage · web build · worker dry-run) and deploys to Cloudflare on push to `main` — **once** the repo has the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. Until then the deploy job is inert.

## Testing

- **Unit** — `tracker` domain logic, `lib/api`, `lib/realtime` (mocked `fetch`/bindings).
- **Integration** — the assembled worker driven through every endpoint over fake Cloudflare bindings (the full proof loop), the queue consumer, the Board DO fan-out, app composition, and the R3 bundle-safety crawl.
- **Coverage** — lines/functions/statements ≥ 90%; branches ≥ 80% (the remainder are type-defensive `?? ""` coalescings on router params that a matched route never reaches with a missing value).

## Stack

`@moku-labs/web` 1.12.4 · `@moku-labs/worker` 0.1.4 · Preact · Cloudflare Workers (D1 · Durable Objects · Queues · KV · R2 · Static Assets) · Bun · Vitest · Biome · ESLint.

This is a Layer-3 Moku consumer app: it composes existing frameworks via `createApp` and never depends on `@moku-labs/core`.
