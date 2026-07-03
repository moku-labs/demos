/**
 * @file Pure helpers — the scoreboard's board-view derivation (display order, FLIP motion inputs,
 * rank labels). No plugin context and **no client-side memory**: everything derives from one synced
 * snapshot (`players` + `scores`) per `spec/scoreboard-animation.md` §1, so the board renders — and
 * animates — identically on every device, after any refresh or reconnect (§I3/§I6).
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
  /** Competition rank label after the round — tied totals share a number (1, 2, 2, 4; §1.7). */
  rankLabel: number;
  /** Competition rank label before the round (same scheme over pre-round totals). */
  prevRankLabel: number;
};

/**
 * Rank entries by total (desc), assigning a fresh 1-based `rank` by position and carrying each
 * entry's previous `rank` into `prevRank`. Ties keep their incoming relative order (V8's sort is
 * stable). Kept for the **podium** (three positional blocks) and phone final ordering — the TV
 * scoreboard uses `boardRows()` instead.
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
 * // → [{ peerId: "b", …, rank: 1 }, { peerId: "a", …, rank: 2 }]
 * ```
 */
export function rank(entries: readonly ScoreEntry[]): readonly ScoreEntry[] {
  return entries
    .toSorted((first, second) => second.total - first.total)
    .map((entry, index) => ({ ...entry, prevRank: entry.rank, rank: index + 1 }));
}

/**
 * Competition rank labels for an already-sorted (descending) list of totals: equal neighbours share
 * a label, and the label after a tie group skips to the group's end position (1, 2, 2, 4 — spec
 * §I4). Display-only — layout must never use these (they collide on ties by design).
 *
 * @param totalsDesc - Totals sorted descending (the order the rows are displayed in).
 * @returns One 1-based label per input, in the same order.
 * @example
 * ```ts
 * competitionLabels([500, 400, 400, 100]); // [1, 2, 2, 4]
 * ```
 */
export function competitionLabels(totalsDesc: readonly number[]): readonly number[] {
  const labels: number[] = [];

  for (const [index, total] of totalsDesc.entries()) {
    const tiedWithAbove = index > 0 && total === totalsDesc[index - 1];
    labels.push(tiedWithAbove ? (labels[index - 1] as number) : index + 1);
  }

  return labels;
}

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

  // Competition labels over both orderings (display-only; §1.7).
  const previousLabels = competitionLabels(preSorted.map(row => preTotal(row.entry)));
  const postLabels = competitionLabels(postSorted.map(row => row.entry.total));

  return postSorted.map((row, position) => ({
    entry: row.entry,
    player: row.player,
    position,
    prevPosition: previousPositionOf.get(row.entry.peerId) ?? position,
    rankLabel: (postLabels[position] ?? position + 1) as number,
    prevRankLabel: (previousLabels[previousPositionOf.get(row.entry.peerId) ?? position] ??
      position + 1) as number
  }));
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
