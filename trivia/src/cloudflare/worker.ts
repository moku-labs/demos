/**
 * @file Cloudflare entry — thin adapter (idiom I4). room's `hubPlugin` provides `server.hub.handle`, which
 * serves ASSETS (incl. the /code/{code} deep-link AND the /bank/** shards), brokers the signaling
 * WS upgrade, AND answers `GET /api/ice` (room 0.8+: fail-open TURN relay credentials, minted from the
 * TURN secrets its own post-deploy step provisions — internet play is framework-owned end to end).
 * This file re-exports the `Hub` DO + delegates, adding ONE targeted tweak: the question-bank shards
 * (`/bank/**`) are pinned to revalidate (`Cache-Control: no-cache`) so a freshly-deployed `/trivia-gen`
 * top-up is never masked by a stale browser/edge copy of a stable-named shard. The wrangler bindings
 * (ROOM_HUB / RATE_LIMIT / ASSETS) are GENERATED from `src/server.ts`'s worker app by
 * `server.cli.{dev,deploy}`.
 */
import { server } from "../server";

export { Hub } from "@moku-labs/room/server"; // wrangler binds ROOM_HUB → Hub (room's Hub DO)

/**
 * The Cloudflare bindings room's hub reads — emitted into the generated wrangler.jsonc by `server.cli` —
 * plus the OPTIONAL TURN secrets the hub's `/api/ice` mints relay credentials with (provisioned at
 * deploy by worker's `turnPlugin` — declared in `src/server.ts`; absent on local dev, where the
 * client fails open to STUN).
 */
type WorkerEnv = {
  ROOM_HUB: DurableObjectNamespace;
  RATE_LIMIT: KVNamespace;
  ASSETS: Fetcher;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
};

/** Path prefix of the question-bank shards — stable (non-content-hashed) names served as static ASSETS. */
const BANK_PREFIX = "/bank/";

export default {
  /**
   * Delegate every request to room's hub (it serves ASSETS incl. the /code/{code} deep-link, the
   * signaling WS upgrade, AND the `/api/ice` TURN-credential mint), forcing the question-bank shards
   * to revalidate. The `/bank/**` JSON is served under stable names, so without this a redeployed
   * `/trivia-gen` top-up could be masked by a stale cached copy; `no-cache` keeps the ETag (cheap
   * 304s) while guaranteeing the new questions go live on the next reload. All other responses pass
   * through untouched.
   *
   * @param request - The incoming request.
   * @param env - Per-request Cloudflare bindings (ROOM_HUB / RATE_LIMIT / ASSETS + TURN secrets).
   * @param ctx - The Worker execution context.
   * @returns The hub's response, with `Cache-Control: no-cache` added for `/bank/**`.
   * @example
   * ```ts
   * export default { fetch };
   * ```
   */
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    const response = await server.hub.handle(request, env, ctx);

    if (!pathname.startsWith(BANK_PREFIX)) return response;

    // Bank shards have stable names — pin them to revalidate so a deployed top-up is never served stale.
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-cache");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
} satisfies ExportedHandler<WorkerEnv>;
