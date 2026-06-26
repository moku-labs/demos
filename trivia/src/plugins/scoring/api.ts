/**
 * @file scoring plugin — public API factory skeleton (award / reset / leaderboard / endStats).
 */
import type { Api } from "./types";

/**
 * Build the scoring API (award points, recompute ranks/deltas, end-of-match stats).
 *
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * createPlugin("scoring", { api: createScoringApi });
 * ```
 */
export function createScoringApi(): Api {
  throw new Error("not implemented");
}
