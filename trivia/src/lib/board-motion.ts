/**
 * @file Pure FLIP geometry for the scoreboard reorder (spec/scoreboard-animation.md §1) — given the
 * rendered tiles' real heights (DOM = post-round order), each tile's pre-round slot, and the list's
 * row gap, compute the `translateY` seed that places every tile at its pre-round position. The DOM
 * glue in `StageScoreboard` measures and applies; the math lives here so the unit suite can pin it
 * (unequal heights included — no equal-row-height assumption).
 */

/**
 * Per-tile `translateY` seeds (px) that shift each rendered tile from its post-round slot to its
 * pre-round slot. Tiles are indexed in DOM (post-round) order; `previousPositions[i]` is tile `i`'s
 * 0-based pre-round slot — a permutation of `0..N−1`, which is exactly what guarantees two tiles
 * can never seed onto the same slot (spec §I1). A tile that did not move seeds `0`.
 *
 * @param heights - Each tile's rendered height in px, in DOM (post-round) order.
 * @param previousPositions - Each tile's pre-round slot, in the same order (a permutation of 0..N−1).
 * @param gap - The list's row gap in px.
 * @returns One `translateY` seed per tile (px; positive = the tile starts lower than it will rest).
 * @example
 * ```ts
 * // Two equal 60px rows that swapped, 12px gap: the climber seeds +72, the slipper −72.
 * flipSeedOffsets([60, 60], [1, 0], 12); // [72, -72]
 * ```
 */
export function flipSeedOffsets(
  heights: readonly number[],
  previousPositions: readonly number[],
  gap: number
): number[] {
  // Mismatched inputs (a row failed to render) → no motion, never a broken permutation.
  if (heights.length !== previousPositions.length) return heights.map(() => 0);

  // Post-round tops: the tiles as laid out, cumulative in DOM order.
  const postTops: number[] = [];
  let cursor = 0;
  for (const height of heights) {
    postTops.push(cursor);
    cursor += height + gap;
  }

  // Pre-round tops: replay the SAME tiles (their real heights) in pre-round slot order.
  const domIndexBySlot = previousPositions
    .map((slot, domIndex) => ({ slot, domIndex }))
    .toSorted((a, b) => a.slot - b.slot);
  const preTops: number[] = Array.from({ length: heights.length }, () => 0);
  cursor = 0;
  for (const { domIndex } of domIndexBySlot) {
    preTops[domIndex] = cursor;
    cursor += (heights[domIndex] ?? 0) + gap;
  }

  return heights.map((_, domIndex) => (preTops[domIndex] ?? 0) - (postTops[domIndex] ?? 0));
}
