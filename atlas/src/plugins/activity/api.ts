/**
 * @file activity plugin — API factory (the read-only Record: recordActivity + list).
 */
import type { ActivityCtx as ActivityContext, Api } from "./types";

/**
 * Creates the activity API surface (idempotent recordActivity + list).
 *
 * @param _ctx - The activity plugin context.
 * @example
 * ```ts
 * export const activityPlugin = createPlugin("activity", { api: ctx => createActivityApi(ctx) });
 * ```
 */
export function createActivityApi(_ctx: ActivityContext): Api {
  throw new Error("not implemented");
}
