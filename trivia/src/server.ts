/**
 * @file Room server composition — the single Cloudflare worker app (hub DO signaling + ASSETS). The
 * `hub` plugin is wired by default; `app.hub.handle` is the fetch the worker entry delegates to. The
 * bindings the generated wrangler.jsonc emits (ROOM_HUB / RATE_LIMIT / ASSETS) come from the hub config.
 */
import { createApp } from "@moku-labs/room/server";

/** The composed room server app — `app.hub.handle` serves ASSETS + brokers serverSignaling. */
export const app = createApp();
