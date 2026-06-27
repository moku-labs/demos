/**
 * @file Server composition — ONE `@moku-labs/worker` app (atlas-style), composing room's `hubPlugin`.
 *
 * Full app-side control: trivia owns its worker composition instead of room owning a server core.
 * - `server.hub.handle` (room's `hubPlugin`) is the runtime fetch — signaling WS → the per-room `Hub` DO /
 *   everything else → ASSETS (the SPA + the `/bank/**` shards). `cloudflare/worker.ts` delegates to it.
 * - `server.cli.{dev,deploy}` (`@moku-labs/worker`) generate `wrangler.jsonc` + run wrangler.
 *
 * `deployPlugin` depends on all five resource plugins, so all are composed; only `kv` (RATE_LIMIT) + the
 * `durableObjects` Hub are configured (storage/d1/queues stay at their empty default → emit no bindings).
 * The hub uses workers-native SQLite (`migrations[].new_sqlite_classes`) — no D1, no migrate step. The
 * binding names match room's hub config defaults (ROOM_HUB / Hub / RATE_LIMIT / ASSETS), so the hub reads
 * the same `env` the generated `wrangler.jsonc` declares. `wrangler.jsonc` is gitignored + generated.
 */
import { hubPlugin } from "@moku-labs/room/server";
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
 * The trivia worker app. `server.hub.handle` is the runtime fetch (room's signaling hub); `server.cli.dev`/
 * `server.cli.deploy` (driven by `scripts/dev.ts`/`deploy.ts`) generate `wrangler.jsonc` + run wrangler.
 *
 * @example
 * ```ts
 * export default { fetch: (req, env, ctx) => server.hub.handle(req, env, ctx) };
 * await server.cli.dev({ webBuild: () => web.cli.build() });
 * ```
 */
export const server = createApp({
  config: { name: "trivia", stage: "production", compatibilityDate: "2026-06-17" },
  plugins: [
    storagePlugin,
    kvPlugin,
    d1Plugin,
    queuesPlugin,
    durableObjectsPlugin,
    hubPlugin,
    deployPlugin,
    cliPlugin
  ],
  pluginConfigs: {
    // Rate-limit KV the hub reads on the signaling-join path (`env.RATE_LIMIT`).
    kv: { rateLimit: { name: "trivia-ratelimit", binding: "RATE_LIMIT" } },
    // The per-room signaling DO — `Hub` (room) is re-exported from `cloudflare/worker.ts`; SQLite-backed.
    durableObjects: { hub: { binding: "ROOM_HUB", className: "Hub" } },
    deploy: {
      entry: "src/cloudflare/worker.ts",
      nodeCompat: true,
      assets: { binding: "ASSETS", directory: "dist/client", spa: true },
      // `run_worker_first` routes EVERY request through `server.hub.handle` first, so the signaling WS
      // upgrade reaches the Hub DO instead of being swallowed by the SPA-fallback asset server.
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
