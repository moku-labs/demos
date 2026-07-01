/**
 * @file Pure helper — rank/sort score entries (descending total, stable). No plugin context.
 */
import type { PlayerProfile, ScoreEntry } from "./types";

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

/**
 * The full ranked standings for the TV scoreboard / reveal roll-up: every scored player PLUS every
 * connected player who has not scored yet (seeded at 0), so a player who is in the game always appears
 * on the board — never omitted just because they have no points yet (the "player missing from the score
 * table" bug). A disconnected player with no score is left out (they are not in the game); a disconnected
 * player who DID score stays visible (their row already exists).
 *
 * @param players - The current roster (connected flags + names).
 * @param scores - The synced score entries (only players who have been awarded appear here).
 * @returns The merged, ranked `ScoreEntry[]` covering every in-game player (highest total first).
 * @example
 * ```ts
 * standings(players, scores); // includes a just-joined 0-point player at the bottom
 * ```
 */
export function standings(
  players: readonly PlayerProfile[],
  scores: readonly ScoreEntry[]
): readonly ScoreEntry[] {
  const scored = new Set(scores.map(entry => entry.peerId));
  const zeroRows: ScoreEntry[] = players
    .filter(player => player.connected && !scored.has(player.peerId))
    .map(player => ({ peerId: player.peerId, total: 0, delta: 0, rank: 0, prevRank: 0 }));
  return rank([...scores, ...zeroRows]);
}
