/**
 * @file Pure helper — rank/sort score entries (descending total, stable). No plugin context.
 */
import type { ScoreEntry } from "./types";

/**
 * Rank entries by total (desc), assigning a fresh 1-based `rank` by position and carrying each
 * entry's previous `rank` into `prevRank` so the scoreboard can animate the F4 reorder ("▲ overtook
 * …"). Ties keep their incoming relative order (V8's sort is stable), so equal totals never thrash.
 *
 * Pure: returns a new array of new entries; the input is never mutated. The host's `scoring` plugin
 * already ranks its synced slice — this helper re-derives a guaranteed-sorted view client-side (the
 * podium order, the interstitial board) without trusting slice order.
 *
 * @param entries - The current score entries (any order).
 * @returns A new array sorted by `total` descending, each with `rank` = position+1 and
 *   `prevRank` = the entry's incoming `rank`.
 * @example
 * ```ts
 * rank([
 *   { peerId: "a", total: 200, delta: 0, rank: 2, prevRank: 2 },
 *   { peerId: "b", total: 500, delta: 0, rank: 1, prevRank: 1 }
 * ]);
 * // → [{ peerId: "b", …, rank: 1, prevRank: 1 }, { peerId: "a", …, rank: 2, prevRank: 2 }]
 * ```
 */
export function rank(entries: readonly ScoreEntry[]): readonly ScoreEntry[] {
  return entries
    .toSorted((first, second) => second.total - first.total)
    .map((entry, index) => ({ ...entry, prevRank: entry.rank, rank: index + 1 }));
}
