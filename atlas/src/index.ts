/**
 * @file Atlas web client — Layer-3 `createApp` composition over `@moku-labs/web`.
 *
 * Atlas is the Tracker redesign: a real-time kanban demo. This is the client / island entry.
 * The `@moku-labs/worker` backend (D1 / KV / R2 / Queues / Durable Objects) and the full
 * route / island / style tree are composed during `/moku:plan create app` + `/moku:build app`.
 */
import { createApp } from "@moku-labs/web";

/**
 * The Atlas web client app instance.
 *
 * Composes the `@moku-labs/web` isomorphic defaults (`site`, `i18n`, `router`, `head`, `spa`)
 * with Atlas's site identity. Routes, islands, the rendering mode, and the node-only
 * build / deploy plugins are layered on during the build.
 *
 * @example
 * ```ts
 * import { app } from "./index";
 * // routes + islands get wired here, then the build/SPA is driven from this instance.
 * ```
 */
export const app = createApp({
  pluginConfigs: {
    site: {
      name: "Atlas",
      url: "https://atlas.example.dev",
      author: "Atlas demo",
      description: "A real-time kanban tracker — the Atlas redesign of the Moku tracker demo."
    }
  }
});
