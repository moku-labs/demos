/**
 * @file match-flow plugin — the per-round category offer (the random subset the picker shows).
 *
 * The category pool is large (`TRIVIA.categories`, 20); each round the active player is offered a fresh
 * random `TRIVIA.offerCount` (6) of them rather than the whole grid. `selectOffer` is a pure helper —
 * it takes the question-bank availability + a count + an injectable RNG (so unit tests are deterministic)
 * and returns the chosen subset, **preferring playable (non-exhausted) categories** so a category whose
 * shard isn't generated yet (or whose questions are all seen) never crowds out one the group can actually
 * play. The host clock calls it at the `roundIntro → categoryPick` transition (`transitions.ts`).
 * @see ./transitions.ts — advanceRoundIntro (the single caller)
 */

/** One category's availability — the structural shape `questionBank.availability()` returns. */
export type OfferItem = { id: string; name: string; emoji: string; exhausted: boolean };

/**
 * Shuffle a list with a Schwartzian (decorate–sort–undecorate) pass keyed by `rng()`. Avoids in-place
 * index swaps (clean under `noUncheckedIndexedAccess`) and is deterministic for a seeded `rng` in tests.
 *
 * @param items - The items to shuffle (not mutated).
 * @param rng - A `() => number` in `[0, 1)` (defaults to `Math.random`).
 * @returns A new shuffled array.
 * @example
 * ```ts
 * shuffle([1, 2, 3], () => 0.5); // a permutation of [1, 2, 3]
 * ```
 */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  return items
    .map(value => ({ value, key: rng() }))
    .toSorted((a, b) => a.key - b.key)
    .map(entry => entry.value);
}

/**
 * Pick the `count` categories to offer this round — a random draw that prefers playable ones.
 *
 * Playable (non-exhausted) categories are shuffled and taken first; if fewer than `count` are playable
 * the remainder is filled with shuffled exhausted ones (so the grid still shows a full set, just with the
 * extras dimmed + unpickable). With `count >= avail.length` every category is returned (shuffled).
 *
 * @param avail - The full per-category availability (`questionBank.availability()`).
 * @param count - How many categories to offer (`TRIVIA.offerCount`).
 * @param rng - Injectable RNG for determinism in tests (defaults to `Math.random`).
 * @returns The chosen subset, length `min(count, avail.length)`, playable-first.
 * @example
 * ```ts
 * const offered = selectOffer(questionBank.availability(), 6); // 6 random categories
 * ```
 */
export function selectOffer<T extends OfferItem>(
  avail: readonly T[],
  count: number,
  rng: () => number = Math.random
): T[] {
  const playable = shuffle(
    avail.filter(category => !category.exhausted),
    rng
  );
  const exhausted = shuffle(
    avail.filter(category => category.exhausted),
    rng
  );
  return [...playable, ...exhausted].slice(0, Math.max(0, count));
}
