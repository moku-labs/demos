/**
 * @file scoring plugin — host-internal state factory.
 *
 * Creates the per-peer stats map used for end-of-match call-outs.
 * This is NOT synced; it lives in `createState` (host-only, in-memory).
 */
import type { State } from "./types";

/**
 * Build the initial (empty) per-peer stats map.
 *
 * Called by the Moku kernel as `createState(ctx)` with a MinimalContext
 * (config + global only). Returns an empty `Map<PeerId, PlayerStats>`.
 *
 * @returns An empty host-internal stats map.
 * @example
 * ```ts
 * createPlugin("scoring", { createState: createScoringState });
 * ```
 */
export function createScoringState(): State {
  return new Map();
}
