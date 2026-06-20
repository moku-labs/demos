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
    bindings: { required: ["DB", "BOARDS_KV", "ATTACHMENTS", "ACTIVITY_QUEUE", "BOARD"] },
    d1: { binding: "DB", migrations: "db/migrations" },
    kv: { binding: "BOARDS_KV" },
    storage: { bucket: "ATTACHMENTS" },
    durableObjects: { bindings: { board: "BOARD" } },
    queues: {
      producers: ["ACTIVITY_QUEUE"],
      // Late-bound: the closure captures `server`; invoked only at queue-event time, after createApp returns (D8).
      // eslint-disable-next-line jsdoc/require-jsdoc -- structural queue consumer callback
      onMessage: async (message: Message, env: WorkerEnv) => {
        const body = message.body as ActivityMessage;
        await server.tracker.recordActivity(env, body.boardId, body.entry);
      }
    },
    tracker: {
      boardDo: "board",
      activityQueue: "ACTIVITY_QUEUE",
      boardIndexKey: "boards:index",
      attachmentPrefix: "attachments/"
    },
    deploy: { configFile: "wrangler.jsonc" },
    // The full HTTP + WebSocket route table — grouped by resource and documented per endpoint —
    // lives in src/endpoints.ts. Keeping it out of the composition root keeps this file about wiring.
    server: { endpoints }
  }
});
