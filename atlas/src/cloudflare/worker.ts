/**
 * @file Cloudflare entry — the thin adapter connecting the Worker runtime to the Moku `server` app.
 *
 * Runs the auth prefix-guard on `/api/*` + `/ws/*` (except public `/api/auth/*`) before delegating to
 * the server router, serves everything else from Static Assets (`env.ASSETS`), and drains the activity
 * queue through `server.queues.consume`. All app logic lives in `../server` and its plugins, never here.
 */
import type { WorkerEnv } from "@moku-labs/worker";
import { server } from "../server";

export { BoardChannel } from "./board-channel"; // Cloudflare instantiates the DO from the Worker module

export default {
  /**
   * Guards `/api/*` + `/ws/*` (except public `/api/auth/*`) then routes to the server; else serves assets.
   *
   * @param request - The incoming request.
   * @param env - Per-request Cloudflare bindings.
   * @param ctx - The Worker execution context.
   * @returns The route or static-asset response.
   * @example
   * ```ts
   * export default { fetch };
   * ```
   */
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return server.server.handle(request, env, ctx);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) {
      const isPublic = url.pathname.startsWith("/api/auth/");
      if (!isPublic && !(await server.auth.isAuthed(request, env))) {
        return new Response("unauthorized", { status: 401 });
      }
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
   * @returns Resolves when the batch is processed.
   * @example
   * ```ts
   * export default { queue };
   * ```
   */
  queue(batch: MessageBatch, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    return server.queues.consume(batch, env, ctx);
  }
} satisfies ExportedHandler<WorkerEnv>;
