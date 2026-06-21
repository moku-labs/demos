/**
 * @file Atlas HTTP + WebSocket endpoint table — the worker's whole routing surface, in one place.
 *
 * Skeleton: only the `/health` liveness probe. The full table (auth · departments · boards · issues ·
 * attachments · customize · activity · live) is populated during the implementation waves. Each entry
 * is a declarative `endpoint(path).method(handler)`; handlers stay thin and delegate to plugins via
 * `ctx.require`. `src/server.ts` consumes this array as `server: { endpoints }`.
 */
import type { Server } from "@moku-labs/worker";
import { endpoint } from "@moku-labs/worker";

/**
 * The Atlas endpoint table. Wired into the worker app via `server: { endpoints }` and dispatched by
 * `server.server.handle` (most-specific path wins).
 *
 * @example
 * ```ts
 * import { endpoints } from "./endpoints";
 * createApp({ pluginConfigs: { server: { endpoints } } });
 * ```
 */
export const endpoints: Server.Endpoint[] = [endpoint("/health").get(() => new Response("ok"))];
