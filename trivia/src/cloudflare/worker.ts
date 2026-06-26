/**
 * @file Cloudflare entry — thin adapter (idiom I4). `app.hub.handle` serves ASSETS (incl. the
 * /controller/{code} deep-link) AND the signaling WS upgrade; this file only re-exports the DO + delegates.
 */
import { app } from "../server";

export { Hub } from "@moku-labs/room/server"; // Cloudflare instantiates the DO from the Worker module

/** The Cloudflare bindings the generated wrangler.jsonc wires from src/server.ts. */
type WorkerEnv = { ROOM_HUB: DurableObjectNamespace; RATE_LIMIT: KVNamespace; ASSETS: Fetcher };

export default {
  /**
   * Delegate every request to the room hub — it serves ASSETS (incl. the /controller/{code} deep-link)
   * AND the signaling WS upgrade, routing internally per `hub.assetsBinding`; the worker does not branch.
   *
   * @param request - The incoming request.
   * @param env - Per-request Cloudflare bindings (ROOM_HUB / RATE_LIMIT / ASSETS).
   * @param ctx - The Worker execution context.
   * @returns The hub's response (static asset or signaling upgrade).
   * @example
   * ```ts
   * export default { fetch };
   * ```
   */
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    return app.hub.handle(request, env, ctx);
  }
} satisfies ExportedHandler<WorkerEnv>;
