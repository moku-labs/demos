/**
 * @file Server composition — the Tracker worker app, built on `@moku-labs/worker`.
 *
 * This is the framework side of the worker: pure Moku wiring, no Cloudflare entry glue. It composes
 * the five resource plugins (kv, d1, queues, storage, durableObjects) with the custom `tracker`
 * plugin plus the `deploy` + `cli` tooling, and declares the endpoint table. The Cloudflare adapter
 * (`cloudflare/worker.ts`) drives this `server` via `server.server.handle` (HTTP/WS) and
 * `server.queues.consume` (the activity queue); the dev/deploy scripts drive `server.cli.*`.
 */

import type { WorkerEnv } from "@moku-labs/worker";
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
import { endpoints } from "./endpoints";
import type { ActivityMessage } from "./lib/types";
import { trackerPlugin } from "./plugins/tracker";

/**
 * The Tracker worker server app — composes the five `@moku-labs/worker` resource plugins (kv, d1,
 * queues, storage, durableObjects) with the custom `tracker` plugin and the `deploy` + `cli` tooling,
 * and declares the endpoint table. The Cloudflare entry (`cloudflare/worker.ts`) drives it via
 * `server.server.handle` (HTTP/WS) and `server.queues.consume`; the scripts drive `server.cli.dev/deploy`.
 *
 * @example
 * ```ts
 * const res = await server.server.handle(request, env, ctx);
 * await server.cli.dev({ webBuild: () => web.cli.build() });
 * ```
 */
export const server = createApp({
  config: { name: "tracker", stage: "production", compatibilityDate: "2026-06-17" },
  plugins: [
    kvPlugin,
    d1Plugin,
    queuesPlugin,
    storagePlugin,
    durableObjectsPlugin,
    trackerPlugin,
    deployPlugin,
    cliPlugin
  ],
  pluginConfigs: {
    // Each resource is a keyed map of instances: the key is the logical id (the `use("key")` selector
    // and the default when sole), `name` is the base Cloudflare resource name (stage-suffixed at
    // deploy), `binding` is the stable env var. No `bindings.required` list — the framework derives
    // the bindings from these declarations.
    d1: { main: { name: "tracker-db", binding: "DB", migrations: "db/migrations" } },
    kv: { boards: { name: "tracker-boards", binding: "BOARDS_KV" } },
    storage: { attachments: { name: "tracker-attachments", binding: "ATTACHMENTS" } },
    durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } },
    queues: {
      activity: {
        name: "tracker-activity",
        binding: "ACTIVITY_QUEUE",
        // Cap the consumer's batch window at 1s (vs Cloudflare's ~5s default) so the live activity
        // feed lands promptly — the whole point of the feed is to watch the worker fire (D7). Written
        // to the generated wrangler `consumers` entry as `max_batch_timeout` (needs @moku-labs/worker ≥ 0.8.0).
        maxBatchTimeout: 1,
        // Late-bound: the closure captures `server`; invoked only at queue-event time, after createApp returns (D8).
        // eslint-disable-next-line jsdoc/require-jsdoc -- structural queue consumer callback
        onMessage: async (message: Message, env: WorkerEnv) => {
          const body = message.body as ActivityMessage;
          await server.tracker.recordActivity(env, body.boardId, body.entry);
        }
      }
    },
    tracker: {
      boardDo: "board",
      activityQueue: "activity",
      boardIndexKey: "boards:index",
      attachmentPrefix: "attachments/"
    },
    deploy: {
      // Worker-level wrangler keys the resource manifest can't derive. `entry` → wrangler `main`;
      // `nodeCompat` → `compatibility_flags: ["nodejs_compat"]` (the worker composes the deploy/cli
      // tooling); `assets` serves the built web client via `env.ASSETS` (SPA fallback for deep links).
      // DO `migrations` are auto-derived from the durableObjects classes.
      entry: "src/cloudflare/worker.ts",
      nodeCompat: true,
      assets: { binding: "ASSETS", directory: "dist/client", spa: true },
      // Cloudflare Workers Observability — turn on metrics + Logs (with invocation logs) at full
      // head-sampling. Traces are emitted automatically once observability is enabled; log Exports
      // (Logpush) are set up separately in the dashboard. `wrangler` is the deploy plugin's escape
      // hatch for top-level keys the typed fields don't derive (it merges into the generated config).
      wrangler: {
        observability: {
          enabled: true,
          head_sampling_rate: 1,
          logs: { enabled: true, invocation_logs: true, head_sampling_rate: 1 }
        }
      }
    },
    // The full HTTP + WebSocket route table — grouped by resource and documented per endpoint —
    // lives in src/endpoints.ts. Keeping it out of the composition root keeps this file about wiring.
    server: { endpoints }
  }
});
