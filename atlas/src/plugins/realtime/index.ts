/**
 * Standard tier — per-board Durable Object broadcast service.
 *
 * Required inline by board-scoped mutation plugins (the `require` side of the two-channel showcase);
 * not an event subscriber.
 *
 * @see README.md
 */
import { createPlugin, durableObjectsPlugin } from "@moku-labs/worker";
import { createRealtimeApi } from "./api";
import type { Config } from "./types";

const defaultConfig: Config = { boardDo: "board" };

export const realtimePlugin = createPlugin("realtime", {
  depends: [durableObjectsPlugin],
  config: defaultConfig,
  // eslint-disable-next-line jsdoc/require-jsdoc -- structural api factory
  api: ctx => createRealtimeApi(ctx)
});
