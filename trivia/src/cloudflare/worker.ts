/**
 * @file Cloudflare entry — thin adapter (idiom I4). room's `hub.handle` serves ASSETS (incl. the
 * /controller/{code} deep-link AND the /bank/** shards) AND brokers the signaling WS upgrade; this file
 * only re-exports the `Hub` DO + delegates. The wrangler bindings (ROOM_HUB / RATE_LIMIT / ASSETS) are
 * GENERATED from `src/server.ts`'s worker app by `server.cli.{dev,deploy}`.
 */
import type { WorkerEnv } from "@moku-labs/worker";
import { room } from "../server";

export { Hub } from "@moku-labs/room/server"; // wrangler binds ROOM_HUB → Hub (durableObjects config)

export default {
  /**
   * Delegate every request to the room hub — it serves ASSETS (incl. the /controller/{code} deep-link)
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
    return room.hub.handle(request, env, ctx);
  }
} satisfies ExportedHandler<WorkerEnv>;
