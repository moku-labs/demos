/**
 * Standard tier — demo-stub KV session gate (the auth prefix-guard's backend).
 *
 * The Cloudflare adapter calls `isAuthed` before `server.server.handle` on every `/api/*` + `/ws/*`
 * request (except the public `/api/auth/*` routes). Not an event subscriber.
 *
 * @see README.md
 */
import { createPlugin, kvPlugin } from "@moku-labs/worker";
import { createAuthApi } from "./api";
import type { Config } from "./types";

const defaultConfig: Config = {
  sessionsKv: "sessions",
  ttlSeconds: 86_400,
  cookieName: "atlas_session"
};

export const authPlugin = createPlugin("auth", {
  depends: [kvPlugin],
  config: defaultConfig,
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural api factory
  api: ctx => createAuthApi(ctx)
});
