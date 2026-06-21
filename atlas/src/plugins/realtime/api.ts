/**
 * @file realtime plugin — API factory (per-board DO broadcast).
 */
import type { Api, RealtimeCtx as RealtimeContext } from "./types";

/**
 * Creates the realtime API surface (per-board Durable Object broadcast).
 *
 * @param _ctx - The realtime plugin context.
 * @example
 * ```ts
 * export const realtimePlugin = createPlugin("realtime", { api: ctx => createRealtimeApi(ctx) });
 * ```
 */
export function createRealtimeApi(_ctx: RealtimeContext): Api {
  throw new Error("not implemented");
}
