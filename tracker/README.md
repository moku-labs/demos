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

One Cloudflare Worker serves both sides. `src/cloudflare/worker.ts` (the thin Cloudflare adapter) branches every request:

- `/api/*` and `/ws/*` → `server.server.handle(...)` (the `tracker` endpoints + the Board DO upgrade)
- everything else → `env.ASSETS.fetch(...)` — the built web client (Cloudflare **Static Assets**)

```
src/
  server.ts        Worker app — createApp(@moku-labs/worker): plugins + endpoints (Moku composition)
  cloudflare/      Cloudflare glue (the only platform-coupled code):
    worker.ts      Worker entry — CF default export { fetch, queue }, connects the runtime to server.ts
    board.ts       Board Durable Object — WebSocket hibernation + fan-out
  plugins/tracker/ Custom Layer-3 plugin — the board domain orchestrator over D1/KV/Queues/R2/DO

  app.ts           Web client — Node build composition (@moku-labs/web; mode "spa")
  spa.tsx          Web client — browser bundle entry
  routes.tsx       Route table: "/" board list, "/b/{id}" board view
  islands/         board-list · board (drag/edit/delete/attach + live patches) · activity-panel
  components/      Preact views (+ colocated @scope CSS)
  lib/             api.ts (REST client) · realtime.ts (WebSocket manager) · types.ts (shared types)
  styles/          main.css (@layer) + tokens/reset/base/components/animations/utilities
```

```
db/
  migrations/0001_init.sql   Applied D1 migration — wrangler d1 migrations apply (wrangler.jsonc → migrations_dir)
  schema.sql                 Human-readable D1 schema reference (kept in sync with the migration)
```

The client and server graphs never cross at runtime — a [bundle-safety test](tests/integration/bundle-safety.test.ts) statically asserts the browser entry never imports `@moku-labs/worker`, `server.ts`, `cloudflare/worker.ts`, `cloudflare/board.ts`, or the `tracker` plugin.

## Develop

```sh
bun install
bun run dev          # build client → apply local D1 migrations → `wrangler dev` (worker + assets + D1/DO/Queue/R2)
```

`bun run dev` is self-contained: it builds the web client, applies the D1 migrations to the **local** Miniflare database, then starts `wrangler dev` (Miniflare emulates D1/DO/Queues/KV/R2). Without the migration step the local D1 has no tables and the first `/api/boards` request fails with `D1_ERROR: no such table: boards` — so it is wired into `dev`. Add `--seed` (`bun run dev --seed`) to also load `db/seed.sql` and reset the cached board index before serving — the local twin of `deploy --seed`, from the same `pluginConfigs.deploy.seed` declaration. The migration step is idempotent; run it on its own any time with:

```sh
bun run migrate:local   # = wrangler d1 migrations apply DB --local
```

### Scripts

| Script | Does |
|---|---|
| `bun run build` | Build the web client → `dist/client` (via `app.cli.build()`) |
| `bun run build:worker` | `wrangler deploy --dry-run` — bundle + validate the worker offline |
| `bun run dev` | Build the client, apply local D1 migrations, then `wrangler dev` (full local app); add `--seed` to load + reset the local seed first |
| `bun run migrate:local` / `migrate:remote` | Apply D1 migrations to the local Miniflare DB / the remote Cloudflare DB |
| `bun run deploy` | Build the client, then `wrangler deploy` (add `--migration` / `--seed` to migrate + seed the remote DB after a successful deploy) |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` / `lint:fix` | Biome + ESLint |
| `bun run test` / `test:coverage` | Vitest (unit + integration); coverage gate |

## Deploy

`bun run deploy` is the Moku **guided** deploy (`server.cli.deploy`): it verifies your Cloudflare token, previews what already exists in the account, confirms before creating anything, provisions the missing D1/KV/R2/Queue resources, writes their ids into [`wrangler.jsonc`](wrangler.jsonc), uploads `dist/client` as Static Assets, and runs `wrangler deploy`.

1. **Credentials** — put `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` in `.env.local`. If the token is missing, `bun run deploy` walks you through it: it prints exactly which token + permissions to create (and scaffolds `.env.local`), then stops cleanly — fill it in and re-run.
2. **Deploy** — `bun run deploy` (guided; prompts on a TTY). Add `--ci` for non-interactive automation.
3. **Migrate + seed in one go** — `bun run deploy --seed` applies the remote D1 migrations and loads `db/seed.sql` (then resets the cached board index) **as part of the deploy**. These post-deploy steps run only after the worker actually goes live and are **skipped on an aborted deploy** (e.g. a first run before the token exists) — so a first `deploy --seed` with no credentials no longer falls through to a raw `wrangler … --remote` auth error. Use `--migration` alone to migrate without seeding. (The standalone `bun run seed:remote` / `migrate:remote` scripts still work for ad-hoc runs against an already-deployed worker.)

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) validates every PR (typecheck · lint · test+coverage · web build · worker dry-run) and deploys to Cloudflare on push to `main` — **once** the repo has the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. Until then the deploy job is inert.

## Testing

- **Unit** — `tracker` domain logic, `lib/api`, `lib/realtime` (mocked `fetch`/bindings).
- **Integration** — the assembled worker driven through every endpoint over fake Cloudflare bindings (the full proof loop), the queue consumer, the Board DO fan-out, app composition, and the R3 bundle-safety crawl.
- **Coverage** — lines/functions/statements ≥ 90%; branches ≥ 80% (the remainder are type-defensive `?? ""` coalescings on router params that a matched route never reaches with a missing value).

## Stack

`@moku-labs/web` 1.13.0 · `@moku-labs/worker` 0.3.0 · Preact · Cloudflare Workers (D1 · Durable Objects · Queues · KV · R2 · Static Assets) · Bun · Vitest · Biome · ESLint.

This is a Layer-3 Moku consumer app: it composes existing frameworks via `createApp` and never depends on `@moku-labs/core`.
