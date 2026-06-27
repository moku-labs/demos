/**
 * @file scoring plugin — pure domain functions.
 *
 * All functions are pure data-in / data-out (no ctx, no side-effects).
 * `index.ts` calls these from inline lambdas so that `ctx` infers correctly
 * from the room factory chain (D1 rule: never hand-roll a PluginContext type).
 *
 * Exported so unit tests can call them directly without any mock context.
 */

import type { CategoryId, PeerId, ScoreEntry } from "../../lib/types";
import type { Config, EndStats, PlayerStats, State } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the integer points for one award result.
 *
 * @param correct - Whether the player answered correctly.
 * @param steal - Whether this is a steal opportunity.
 * @param tier - The question's difficulty tier.
 * @param config - The scoring config (basePoints + stealFraction).
 * @returns Integer points earned (0 for wrong answers).
 * @example
 * ```ts
 * computePoints(true, false, "easy", config); // 100
 * ```
 */
function computePoints(
  correct: boolean,
  steal: boolean,
  tier: "easy" | "medium" | "hard",
  config: Config
): number {
  if (!correct) return 0;
  const base = config.basePoints[tier];
  return steal ? Math.round(base * config.stealFraction) : base;
}

/**
 * Ensure a peer stats record exists in the host-internal state map,
 * creating a zeroed entry if absent.
 *
 * @param state - The host-internal stats Map (mutated in place).
 * @param peerId - The peer to ensure.
 * @returns The (possibly newly created) stats record.
 * @example
 * ```ts
 * const stats = ensureStats(state, "peer-1");
 * ```
 */
function ensureStats(state: State, peerId: PeerId): PlayerStats {
  let stats = state.get(peerId);
  if (stats === undefined) {
    stats = { steals: 0, curStreak: 0, bestStreak: 0, perCategory: {} };
    state.set(peerId, stats);
  }
  return stats;
}

/**
 * Re-key a peer's score + host-internal stats from `oldPeerId` to `newPeerId` (a phone reconnect:
 * the room framework minted a fresh peerId for the same human). Moves the leaderboard `entries` row
 * and the `State` stats record under the new key (rewriting the row's `peerId`), and re-publishes the
 * board so the synced `scores` slice tracks the new peerId. A no-op when the player had no prior score
 * (never awarded) or the ids are equal. The returned rows are the new board (empty array if unchanged).
 *
 * @param state - The host-internal stats Map (mutated: re-keyed old→new).
 * @param entries - The leaderboard mirror Map (mutated: re-keyed old→new).
 * @param oldPeerId - The departing/stale peerId to migrate from.
 * @param newPeerId - The reconnecting phone's fresh peerId to migrate to.
 * @returns The re-published board rows, or `undefined` when nothing changed (skip the slice write).
 * @example
 * ```ts
 * const rows = rebindScore(state, entries, "old", "new");
 * if (rows) mutate("scores", () => ({ entries: rows }));
 * ```
 */
export function rebindScore(
  state: State,
  entries: Map<PeerId, ScoreEntry>,
  oldPeerId: PeerId,
  newPeerId: PeerId
): ScoreEntry[] | undefined {
  if (oldPeerId === newPeerId) return undefined;

  const stats = state.get(oldPeerId);
  if (stats !== undefined) {
    state.delete(oldPeerId);
    state.set(newPeerId, stats);
  }

  const row = entries.get(oldPeerId);
  if (row === undefined) return undefined;
  entries.delete(oldPeerId);
  entries.set(newPeerId, { ...row, peerId: newPeerId });

  return [...entries.values()];
}

/**
 * Stamp a score entry with this peer's synced end-stats (`topCategory` + `bestStreak`),
 * read from the host-internal stats map so the phone final card (A15) can show them.
 *
 * A peer with no host-internal stats (never awarded) gets `topCategory: null` and
 * `bestStreak: 0`. The fields are optional on `ScoreEntry`, but we always populate
 * them on publish so the synced `scores` slice is self-describing.
 *
 * @param entry - The score entry to decorate (not mutated; a copy is returned).
 * @param state - The host-internal stats Map.
 * @returns A new `ScoreEntry` carrying `topCategory` and `bestStreak`.
 * @example
 * ```ts
 * const stamped = decorateWithStats(entry, state); // { ...entry, topCategory: "animals", bestStreak: 3 }
 * ```
 */
function decorateWithStats(entry: ScoreEntry, state: State): ScoreEntry {
  const stats = state.get(entry.peerId);
  return {
    ...entry,
    // eslint-disable-next-line unicorn/no-null -- the synced ScoreEntry uses null for "no top category yet"
    topCategory: stats ? (topCategoryFor(stats.perCategory) ?? null) : null,
    bestStreak: stats?.bestStreak ?? 0
  };
}

/**
 * Recompute ranks for all entries from scratch, preserving `prevRank`.
 *
 * Rank 1 = highest total. Tied players receive the same rank.
 * `prevRank` is set to the entry's current `rank` before recomputing,
 * enabling F4 rank-swap animations on the big screen.
 *
 * @param entries - Current score entries array.
 * @returns New array with updated `rank` and `prevRank` fields.
 * @example
 * ```ts
 * const reranked = recomputeRanks([...entries.values()]);
 * ```
 */
function recomputeRanks(entries: ScoreEntry[]): ScoreEntry[] {
  const withPrevious = entries.map(entry => ({ ...entry, prevRank: entry.rank }));
  const sorted = withPrevious.toSorted((a, b) => b.total - a.total);

  const rankMap = new Map<PeerId, number>();
  let currentRank = 1;
  let previousTotal: number | undefined;
  let position = 0;

  for (const entry of sorted) {
    position += 1;
    if (previousTotal !== undefined && entry.total < previousTotal) {
      currentRank = position;
    }
    rankMap.set(entry.peerId, currentRank);
    previousTotal = entry.total;
  }

  return withPrevious.map(entry => ({ ...entry, rank: rankMap.get(entry.peerId) ?? 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public pure domain functions (called from index.ts inline lambdas)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process one award: updates `state` in place, updates `entries` in place,
 * and returns the new `ScoreEntry[]` for publishing to the `scores` slice.
 *
 * @param state - Host-internal stats Map (mutated in place).
 * @param entries - In-memory leaderboard mirror (mutated in place).
 * @param config - Scoring configuration (basePoints + stealFraction).
 * @param peerId - The peer being scored.
 * @param opts - Award options.
 * @param opts.correct - Whether the player answered correctly.
 * @param opts.steal - Whether this is a steal opportunity.
 * @param opts.tier - The question's difficulty tier.
 * @param opts.category - The question's category.
 * @returns The updated `ScoreEntry[]` snapshot to publish.
 * @example
 * ```ts
 * const newEntries = computeAward(state, entries, config, peerId, { correct: true, steal: false, tier: "easy", category: "animals" });
 * stage.mutate("scores", () => ({ entries: newEntries }));
 * ```
 */
export function computeAward(
  state: State,
  entries: Map<PeerId, ScoreEntry>,
  config: Config,
  peerId: PeerId,
  opts: {
    correct: boolean;
    steal: boolean;
    tier: "easy" | "medium" | "hard";
    category: CategoryId;
  }
): ScoreEntry[] {
  const points = computePoints(opts.correct, opts.steal, opts.tier, config);

  const stats = ensureStats(state, peerId);
  const existing = entries.get(peerId) ?? { peerId, total: 0, delta: 0, rank: 0, prevRank: 0 };
  entries.set(peerId, { ...existing, total: existing.total + points, delta: points });

  if (opts.correct && opts.steal) {
    stats.steals += 1;
  }

  if (opts.correct) {
    stats.curStreak += 1;
    if (stats.curStreak > stats.bestStreak) {
      stats.bestStreak = stats.curStreak;
    }
    stats.perCategory[opts.category] = (stats.perCategory[opts.category] ?? 0) + 1;
  } else {
    stats.curStreak = 0;
  }

  const reranked = recomputeRanks([...entries.values()]);
  for (const entry of reranked) {
    entries.set(entry.peerId, decorateWithStats(entry, state));
  }

  return [...entries.values()];
}

/**
 * Zero all entries in place and clear host-internal stats.
 * Returns the zeroed `ScoreEntry[]` for publishing to the `scores` slice.
 *
 * @param state - Host-internal stats Map (mutated in place).
 * @param entries - In-memory leaderboard mirror (mutated in place).
 * @returns The zeroed `ScoreEntry[]` snapshot to publish.
 * @example
 * ```ts
 * const zeroed = resetBoard(state, entries);
 * stage.mutate("scores", () => ({ entries: zeroed }));
 * ```
 */
export function resetBoard(state: State, entries: Map<PeerId, ScoreEntry>): ScoreEntry[] {
  for (const stats of state.values()) {
    stats.steals = 0;
    stats.curStreak = 0;
    stats.bestStreak = 0;
    stats.perCategory = {};
  }
  for (const [peerId, entry] of entries.entries()) {
    const zeroed: ScoreEntry = { ...entry, total: 0, delta: 0, rank: 0, prevRank: 0 };
    entries.set(peerId, decorateWithStats(zeroed, state));
  }
  return [...entries.values()];
}

/**
 * Return a sorted snapshot of the current leaderboard (highest total first).
 *
 * @param entries - The in-memory leaderboard mirror.
 * @returns A readonly array of `ScoreEntry` sorted by `total` descending.
 * @example
 * ```ts
 * const top = computeLeaderboard(entries);
 * ```
 */
export function computeLeaderboard(entries: Map<PeerId, ScoreEntry>): readonly ScoreEntry[] {
  return [...entries.values()].toSorted((a, b) => b.total - a.total);
}

/**
 * Find the category with the highest correct-answer count for a single peer.
 *
 * @param perCategory - The peer's sparse category-to-count map.
 * @returns The leading `CategoryId`, or `undefined` if no correct answers.
 * @example
 * ```ts
 * topCategoryFor({ animals: 3, space: 1 }); // "animals"
 * ```
 */
function topCategoryFor(perCategory: Partial<Record<CategoryId, number>>): CategoryId | undefined {
  const entries = Object.entries(perCategory) as Array<[CategoryId, number]>;
  if (entries.length === 0) return undefined;
  let topCat: CategoryId | undefined;
  let topCount = 0;
  for (const [cat, count] of entries) {
    if (count > topCount) {
      topCount = count;
      topCat = cat;
    }
  }
  return topCat;
}

/**
 * Compute end-of-match statistics for the A8 podium call-out.
 *
 * Reads host-internal stats (steals, bestStreak, perCategory) and returns:
 * - `mostSteals`: the peer with the most successful steals (undefined if none).
 * - `highestStreak`: the peer with the best answer streak (undefined if none).
 * - `topCategory`: each peer's favourite category by correct answer count (undefined if none).
 *
 * @param state - The host-internal stats Map.
 * @returns The `EndStats` object for the podium screen.
 * @example
 * ```ts
 * const { mostSteals, highestStreak, topCategory } = computeEndStats(state);
 * ```
 */
export function computeEndStats(state: State): EndStats {
  let mostSteals: EndStats["mostSteals"];
  let highestStreak: EndStats["highestStreak"];
  const topCategory: Record<PeerId, CategoryId | undefined> = {};

  for (const [peerId, stats] of state.entries()) {
    if (stats.steals > 0 && (mostSteals === undefined || stats.steals > mostSteals.count)) {
      mostSteals = { peerId, count: stats.steals };
    }
    if (
      stats.bestStreak > 0 &&
      (highestStreak === undefined || stats.bestStreak > highestStreak.streak)
    ) {
      highestStreak = { peerId, streak: stats.bestStreak };
    }
    topCategory[peerId] = topCategoryFor(stats.perCategory);
  }

  return { mostSteals, highestStreak, topCategory };
}
