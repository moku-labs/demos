/**
 * @file Server composition — the Atlas worker app, built on `@moku-labs/worker`.
 *
 * Composes the 5 resource plugins with the 8 custom plugins + deploy/cli, and the endpoint table.
 * The Cloudflare adapter (`cloudflare/worker.ts`) drives this `server` via `server.server.handle`
 * (HTTP/WS) and `server.queues.consume` (the activity queue); the dev/deploy scripts drive `server.cli.*`.
 */
import type { WorkerEnv } from "@moku-labs/worker";
import {
  cliPlugin,
  createApp,
  d1Plugin,
  deployPlugin,
  durableObjectsPlugin,
  kvPlugin,
  queuesPlugin,
  storagePlugin
} from "@moku-labs/worker";
import { endpoints } from "./endpoints";
import type { ActivityMessage } from "./lib/types";
import { activityPlugin } from "./plugins/activity";
import { attachmentsPlugin } from "./plugins/attachments";
import { authPlugin } from "./plugins/auth";
import { boardsPlugin } from "./plugins/boards";
import { customizePlugin } from "./plugins/customize";
import { departmentsPlugin } from "./plugins/departments";
import { issuesPlugin } from "./plugins/issues";
import { realtimePlugin } from "./plugins/realtime";

/**
 * The Atlas worker server app. Driven by `cloudflare/worker.ts` (`server.server.handle`,
 * `server.queues.consume`); the dev/deploy scripts drive `server.cli.*`.
 *
 * @example
 * ```ts
 * const res = await server.server.handle(request, env, ctx);
 * ```
 */
export const server = createApp({
  config: { name: "atlas", stage: "production", compatibilityDate: "2026-06-17" },
  plugins: [
    kvPlugin,
    d1Plugin,
    queuesPlugin,
    storagePlugin,
    durableObjectsPlugin,
    realtimePlugin,
    authPlugin,
    attachmentsPlugin,
    customizePlugin,
    departmentsPlugin,
    boardsPlugin,
    issuesPlugin,
    activityPlugin,
    deployPlugin,
    cliPlugin
  ],
  pluginConfigs: {
    d1: { main: { name: "atlas-db", binding: "DB", migrations: "db/migrations" } },
    kv: {
      boards: { name: "atlas-boards", binding: "BOARDS_KV" },
      sessions: { name: "atlas-sessions", binding: "SESSIONS_KV" }
    },
    storage: { attachments: { name: "atlas-attachments", binding: "ATTACHMENTS" } },
    durableObjects: { board: { binding: "BOARD", className: "BoardChannel" } },
    queues: {
      activity: {
        name: "atlas-activity",
        binding: "ACTIVITY_QUEUE",
        maxBatchTimeout: 1,
        // eslint-disable-next-line jsdoc/require-jsdoc -- structural queue consumer callback
        onMessage: async (message: Message, env: WorkerEnv) => {
          await server.activity.recordActivity(env, message.body as ActivityMessage);
        }
      }
    },
    // realtime/auth/attachments/boards/activity carry config; customize/departments/issues are void-config → omitted.
    realtime: { boardDo: "board" },
    auth: { sessionsKv: "sessions", ttlSeconds: 86_400, cookieName: "atlas_session" },
    attachments: { storage: "attachments", attachmentPrefix: "attachments/" },
    boards: { boardsKv: "boards", boardIndexKey: "boards:index" },
    activity: { activityQueue: "activity" },
    deploy: {
      entry: "src/cloudflare/worker.ts",
      nodeCompat: true,
      assets: { binding: "ASSETS", directory: "dist/client", spa: true },
      seed: { file: "db/seed.sql", resetKv: [{ binding: "BOARDS_KV", key: "boards:index" }] }
    },
    server: { endpoints }
  }
});
