/**
 * @file Pure helpers — the ONE ranking derivation every surface uses (TV scoreboard, phone final
 * card, podium): display order, FLIP motion inputs, rank labels. No plugin context and **no
 * client-side memory**: everything derives from one synced snapshot (`players` + `scores`) per
 * `spec/scoreboard-animation.md` §1, so the board renders — and animates — identically on every
 * device, after any refresh or reconnect (§I3/§I6).
 *
 * Ties are RESOLVED, never shared (product decision 2026-07-03): ranks are unique 1..N — "first to
 * reach a score defends it", a challenger must EXCEED to pass (§I2). No two players ever show the
 * same rank number.
 *
 * The synced `rank`/`prevRank` fields are deliberately **not** consumed here: the host recomputes
 * them at every award (already final by scoreboard time) and they share numbers on ties — both
 * properties made them unusable as display positions (the overlap / never-animates bugs).
 */
import type { PlayerProfile, ScoreEntry } from "./types";

/**
 * One fully-derived scoreboard row: the synced entry + resolved profile + the unique display slots
 * (before/after the round) and the competition rank labels. `boardRows()` returns these in display
 * (post-round) order, so `rows[i].position === i`.
 */
export type BoardRow = {
  /** The synced score entry (totals + this round's delta). */
  entry: ScoreEntry;
  /** The resolved roster profile (name, colour, avatar). */
  player: PlayerProfile;
  /** The 0-based display slot AFTER the round — unique per row (spec §1.6). */
  position: number;
  /** The 0-based display slot BEFORE the round — unique per row, derived from `total − delta` (§1.5). */
  prevPosition: number;
  /** The unique 1-based rank after the round (`position + 1` — ties resolved, never shared; §1.7). */
  rankLabel: number;
  /** The unique 1-based rank before the round (`prevPosition + 1`). */
  prevRankLabel: number;
};

/**
 * The full derived board for the TV scoreboard — every scored player PLUS every connected player
 * who has not scored yet (seeded at 0), resolved against the roster, with **unique** before/after
 * display slots and competition labels (the whole schema of `spec/scoreboard-animation.md` §1):
 *
 * - `prevPosition` sorts by pre-round total (`total − delta`, valid because `clearDeltas` zeroes
 *   deltas at question-live), tie-broken by roster join order — the board as it stood last round.
 * - `position` sorts by total, tie-broken by `prevPosition` — the **exceed rule** (§I2): equal
 *   totals never reorder, so a challenger who ties does not pass and tie groups never thrash.
 * - Both are permutations of `0..N−1` over the returned rows — two rows can never share a slot
 *   (§I1), which is what makes the old same-score overlap impossible by construction.
 *
 * A row whose player left the roster is dropped (leavers vanish; S14); a *disconnected* player who
 * scored keeps their row; a disconnected player who never scored is not added.
 *
 * @param players - The current roster (join order = the identity tiebreak).
 * @param scores - The synced score entries (only `total` + `delta` are consumed).
 * @returns The derived rows in display (post-round) order — `rows[i].position === i`.
 * @example
 * ```ts
 * const rows = boardRows(s.players, s.scores);
 * rows.map(r => `${r.player.name}@${r.prevPosition}→${r.position}`);
 * ```
 */
export function boardRows(
  players: readonly PlayerProfile[],
  scores: readonly ScoreEntry[]
): readonly BoardRow[] {
  // Merge a zero row for every connected roster player with no score entry (never silently dropped).
  const scored = new Set(scores.map(entry => entry.peerId));
  const zeroRows: ScoreEntry[] = players
    .filter(player => player.connected && !scored.has(player.peerId))
    .map(player => ({ peerId: player.peerId, total: 0, delta: 0, rank: 0, prevRank: 0 }));

  // Resolve each entry to its roster profile; a row whose player left the roster is dropped, so the
  // orderings below are permutations over exactly the rendered set (S14 stays gap-free).
  const identity = new Map(players.map((player, index) => [player.peerId, index]));
  const rows = [...scores, ...zeroRows].flatMap(entry => {
    const player = players[identity.get(entry.peerId) ?? -1];
    return player === undefined ? [] : [{ entry, player }];
  });

  // The board as it stood BEFORE the round: pre-round totals, ties by join order (§1.5).
  const preSorted = rows.toSorted(
    (a, b) =>
      preTotal(b.entry) - preTotal(a.entry) ||
      (identity.get(a.entry.peerId) ?? 0) - (identity.get(b.entry.peerId) ?? 0)
  );
  const previousPositionOf = new Map(preSorted.map((row, index) => [row.entry.peerId, index]));

  // The board AFTER the round: totals, ties by previous standing — the exceed rule (§1.6/§I2).
  const postSorted = rows.toSorted(
    (a, b) =>
      b.entry.total - a.entry.total ||
      (previousPositionOf.get(a.entry.peerId) ?? 0) - (previousPositionOf.get(b.entry.peerId) ?? 0)
  );

  // Unique 1-based rank labels straight off the resolved slots (ties never share a number; §1.7).
  return postSorted.map((row, position) => {
    const previousPosition = previousPositionOf.get(row.entry.peerId) ?? position;
    return {
      entry: row.entry,
      player: row.player,
      position,
      prevPosition: previousPosition,
      rankLabel: position + 1,
      prevRankLabel: previousPosition + 1
    };
  });
}

/**
 * A row's pre-round total — the score it held when the previous scoreboard settled (valid because
 * `clearDeltas` zeroes every `delta` as each new question goes live).
 *
 * @param entry - The synced score entry.
 * @returns `total − delta`.
 * @example
 * ```ts
 * preTotal({ total: 400, delta: 300, ... }); // 100
 * ```
 */
function preTotal(entry: ScoreEntry): number {
  return entry.total - entry.delta;
}

/**
 * The largest number of display slots any row climbs this round (0 when nothing moves up) — the
 * pitch input for the scoreboard overtake whoosh, derived from the SAME positions the FLIP animates
 * (spec §5), so the audio always matches the motion (including multi-award steal rounds).
 *
 * @param rows - The derived board rows (`boardRows()` output).
 * @returns The maximum `prevPosition − position` across rows, floored at 0.
 * @example
 * ```ts
 * maxClimb(boardRows(players, scores)); // 2 → the big-overtake whoosh pitch
 * ```
 */
export function maxClimb(rows: readonly BoardRow[]): number {
  let best = 0;
  for (const row of rows) best = Math.max(best, row.prevPosition - row.position);
  return best;
}
