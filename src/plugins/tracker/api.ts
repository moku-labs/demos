/**
 * @file tracker plugin — API factory skeleton.
 */
import type { Api } from "./types";

/**
 * Creates the tracker plugin API surface (env-first board domain over D1/KV/Queues/R2/DO).
 *
 * @param _ctx - Plugin context (own config + require + emit). Typed as TrackerCtx in the build wave.
 * @example
 * ```ts
 * const api = createTrackerApi(ctx);
 * ```
 */
export function createTrackerApi(_ctx: unknown): Api {
  throw new Error("not implemented");
}
