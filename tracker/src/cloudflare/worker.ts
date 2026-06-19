/**
 * @file Cloudflare entry — the thin adapter that connects the Cloudflare Worker runtime to the Moku
 * `server` app (`../server`). It holds only platform glue: the `ExportedHandler` default export the
 * runtime invokes, and the Board Durable Object re-export the runtime instantiates.
 *
 * `fetch` branches `/health` + `/api/*` + `/ws/*` to the server router and serves everything else
 * from Cloudflare Static Assets (`env.ASSETS`, the built web client). `queue` drains the activity
 * queue through `server.queues.consume`. All app logic — endpoints, plugins, and the worker
 * primitives (D1, KV, Queues, R2, DO) — lives in `../server` and the `tracker` plugin, never here.
 */

import type { WorkerEnv } from "@moku-labs/worker";
import { server } from "../server";

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
      return server.server.handle(request, env, ctx);
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
    return server.queues.consume(batch, env, ctx);
  }
} satisfies ExportedHandler<WorkerEnv>;
