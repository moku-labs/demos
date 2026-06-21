/**
 * @file activity plugin — hook handlers (enqueue an ActivityMessage per domain event).
 */
import type { ActivityCtx as ActivityContext } from "./types";

/**
 * Builds the hook handlers — one per domain event — that enqueue to the activity queue. Each reuses
 * the mutation-site eventId. The real hook map (typed over the merged domain events) lands during the
 * build wave; the skeleton stub throws.
 *
 * @param _ctx - The activity plugin context.
 * @example
 * ```ts
 * hooks: ctx => createHandlers(ctx);
 * ```
 */
export function createHandlers(_ctx: ActivityContext): never {
  throw new Error("not implemented");
}
