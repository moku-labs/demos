/**
 * @file Worker entry — composes `@moku-labs/worker` and exports the Cloudflare default handler.
 *
 * `fetch` branches `/health` + `/api/*` + `/ws/*` to the server router (the tracker endpoints) and
 * serves everything else from Cloudflare Static Assets (`env.ASSETS`, the built web client). `queue` drains
 * the activity queue through the late-bound app closure (D8). The Board DO class is re-exported so
 * the runtime can instantiate it. Endpoint handlers stay thin: read params/body, call the tracker
 * api, return a `Response` — the worker primitives (D1, KV, Queues, R2, DO) fire inside `tracker`.
 */

import type { WorkerEnv } from "@moku-labs/worker";
import {
  createApp,
  d1Plugin,
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
 * queues, storage, durableObjects) with the custom `tracker` plugin and declares the endpoint table.
 * The Cloudflare default export below drives it via `app.server.handle` (HTTP/WS) and
 * `app.queues.consume` (the activity queue).
 *
 * @example
 * ```ts
 * const res = await app.server.handle(request, env, ctx);
 * ```
 */
export const app = createApp({
  config: { name: "tracker", stage: "production", compatibilityDate: "2026-06-17" },
  plugins: [kvPlugin, d1Plugin, queuesPlugin, storagePlugin, durableObjectsPlugin, trackerPlugin],
  pluginConfigs: {
    bindings: { required: ["DB", "BOARDS_KV", "ATTACHMENTS", "ACTIVITY_QUEUE", "BOARD"] },
    d1: { binding: "DB" },
    kv: { binding: "BOARDS_KV" },
    storage: { bucket: "ATTACHMENTS" },
    durableObjects: { bindings: { board: "BOARD" } },
    queues: {
      producers: ["ACTIVITY_QUEUE"],
      // Late-bound: the closure captures `app`; invoked only at queue-event time, after createApp returns (D8).
      // eslint-disable-next-line jsdoc/require-jsdoc -- structural queue consumer callback
      onMessage: async (message: Message, env: WorkerEnv) => {
        const body = message.body as ActivityMessage;
        await app.tracker.recordActivity(env, body.boardId, body.entry);
      }
    },
    tracker: {
      boardDo: "board",
      activityQueue: "ACTIVITY_QUEUE",
      boardIndexKey: "boards:index",
      attachmentPrefix: "attachments/"
    },
    // The full HTTP + WebSocket route table — grouped by resource and documented per endpoint —
    // lives in src/endpoints.ts. Keeping it out of the composition root keeps this file about wiring.
    server: { endpoints }
  }
});

export { Board } from "./board"; // Cloudflare instantiates the DO class from the Worker module

export default {
  /**
   * Routes `/health` + `/api/*` + `/ws/*` to the server; serves all other paths from Static Assets.
   *
   * @param request - The incoming request.
   * @param env - Per-request Cloudflare bindings.
   * @param ctx - The Worker execution context (waitUntil / passThroughOnException).
   * @returns The route response, or the static-asset response.
   * @example
   * ```ts
   * export default { fetch };
   * ```
   */
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (
      url.pathname === "/health" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/ws/")
    ) {
      return app.server.handle(request, env, ctx);
    }
    return (env.ASSETS as Fetcher).fetch(request);
  },
  /**
   * Drains the activity queue through the app's queue consumer.
   *
   * @param batch - The delivered message batch.
   * @param env - Per-request Cloudflare bindings.
   * @param ctx - The Worker execution context.
   * @returns Resolves when the batch has been processed.
   * @example
   * ```ts
   * export default { queue };
   * ```
   */
  queue(batch: MessageBatch, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    return app.queues.consume(batch, env, ctx);
  }
} satisfies ExportedHandler<WorkerEnv>;
