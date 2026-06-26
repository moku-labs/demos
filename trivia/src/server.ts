/**
 * @file Server composition — two side-by-side apps for the single Cloudflare worker (idiom I2).
 *
 * - `room` (`@moku-labs/room/server`) is the **runtime**: `room.hub.handle` routes the signaling WS
 *   upgrade → the per-room `Hub` Durable Object and everything else → static ASSETS (the SPA + the
 *   `/bank/**` question shards). It is the fetch the Cloudflare entry (`cloudflare/worker.ts`) delegates to.
 * - `server` (`@moku-labs/worker`) is the **build/deploy tooling**: it owns NO request handling here —
 *   it exists purely so `server.cli.dev` / `server.cli.deploy` **generate `wrangler.jsonc`** (the room
 *   server core ships no config generator; the Layer-3 app owns its wrangler config). Its `durableObjects`
 *   + `kv` + `deploy.assets` declarations mirror room's hub binding defaults (`ROOM_HUB` / `Hub` / `ASSETS`
 *   / `RATE_LIMIT`) so the emitted bindings match what `room.hub.handle` reads at runtime.
 *
 * The `Hub` DO uses workers-native SQLite (`migrations[].new_sqlite_classes`, applied by wrangler) — there
 * is no D1 binding and no `wrangler d1 migrations apply` step. `wrangler.jsonc` is a generated artifact
 * (gitignored, never committed; ids captured at deploy).
 */
import { createApp as createRoomServer } from "@moku-labs/room/server";
import {
  cliPlugin,
  createApp,
  d1Plugin,
  deployPlugin,
  durableObjectsPlugin,
  kvPlugin,
  queuesPlugin,
  storagePlugin
} from "@moku-labs/worker";

/**
 * The room signaling app — the worker's runtime fetch handler. `room.hub.handle(request, env, ctx)` serves
 * ASSETS (incl. the `/controller/{code}` deep-link) AND brokers the WebRTC signaling WS upgrade through the
 * per-room `Hub` DO; `cloudflare/worker.ts` delegates `fetch` to it.
 *
 * @example
 * ```ts
 * export default { fetch: (req, env, ctx) => room.hub.handle(req, env, ctx) };
 * ```
 */
export const room = createRoomServer();

/**
 * The worker tooling app — composed purely to drive `server.cli.dev` / `server.cli.deploy`, which
 * **generate `wrangler.jsonc`** from these declarations (`@moku-labs/worker`'s `deployPlugin` writes the
 * config; the room server core ships no generator). The runtime fetch is `room.hub.handle`, not this app's
 * default `serverPlugin` (left at its empty-endpoints default).
 *
 * `deploy.wrangler.assets` is the escape hatch that fully replaces the generated assets block with
 * `run_worker_first: true` — REQUIRED so the signaling WS upgrade (`/{code}`) reaches the `Hub` DO instead
 * of being swallowed by the SPA-fallback asset server; non-WS requests the hub forwards to ASSETS.
 *
 * @example
 * ```ts
 * await server.cli.dev({ webBuild: () => web.cli.build() }); // generates wrangler.jsonc + runs wrangler dev
 * ```
 */
export const server = createApp({
  config: { name: "trivia", stage: "production", compatibilityDate: "2026-06-17" },
  // `deployPlugin` depends on all five resource plugins; trivia only uses KV (rate-limit) + a DO (the
  // signaling Hub), so `storage`/`d1`/`queues` compose at their empty-config default and emit no bindings.
  plugins: [
    storagePlugin,
    kvPlugin,
    d1Plugin,
    queuesPlugin,
    durableObjectsPlugin,
    deployPlugin,
    cliPlugin
  ],
  pluginConfigs: {
    // Rate-limit KV, read on the signaling-join path (`env.RATE_LIMIT`) — the hub's `rateLimit.kvBinding` default.
    kv: { rateLimit: { name: "trivia-ratelimit", binding: "RATE_LIMIT" } },
    // The per-room signaling DO — `Hub` is re-exported from `cloudflare/worker.ts`; SQLite-backed (below).
    durableObjects: { hub: { binding: "ROOM_HUB", className: "Hub" } },
    deploy: {
      entry: "src/cloudflare/worker.ts",
      nodeCompat: true,
      assets: { binding: "ASSETS", directory: "dist/client", spa: true },
      wrangler: {
        observability: { enabled: true, logs: { enabled: true } },
        assets: {
          binding: "ASSETS",
          directory: "dist/client",
          not_found_handling: "single-page-application",
          run_worker_first: true
        }
      }
    }
  }
});
