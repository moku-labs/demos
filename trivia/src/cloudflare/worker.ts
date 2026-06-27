/**
 * @file Cloudflare entry — thin adapter (idiom I4). room's `hubPlugin` provides `server.hub.handle`, which
 * serves ASSETS (incl. the /controller/{code} deep-link AND the /bank/** shards) AND brokers the signaling
 * WS upgrade; this file only re-exports the `Hub` DO + delegates. The wrangler bindings (ROOM_HUB /
 * RATE_LIMIT / ASSETS) are GENERATED from `src/server.ts`'s worker app by `server.cli.{dev,deploy}`.
 */
import { server } from "../server";

export { Hub } from "@moku-labs/room/server"; // wrangler binds ROOM_HUB → Hub (room's Hub DO)

/** The Cloudflare bindings room's hub reads — emitted into the generated wrangler.jsonc by `server.cli`. */
type WorkerEnv = { ROOM_HUB: DurableObjectNamespace; RATE_LIMIT: KVNamespace; ASSETS: Fetcher };

export default {
  /**
   * Delegate every request to room's hub — it serves ASSETS (incl. the /controller/{code} deep-link)
   * AND the signaling WS upgrade, routing internally per the hub's assets binding; the worker does not branch.
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
    return server.hub.handle(request, env, ctx);
  }
} satisfies ExportedHandler<WorkerEnv>;
