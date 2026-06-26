/**
 * @file Pure helper — rank/sort score entries (descending total, stable). No plugin context.
 */
import type { ScoreEntry } from "./types";

/**
 * Rank entries by total (desc), assigning rank + carrying prevRank for the reorder animation.
 *
 * @param _entries - The current score entries.
 * @throws {Error} Always — skeleton stub, implemented in the build wave.
 * @example
 * ```ts
 * rank(entries);
 * ```
 */
export function rank(_entries: readonly ScoreEntry[]): readonly ScoreEntry[] {
  throw new Error("not implemented");
}
