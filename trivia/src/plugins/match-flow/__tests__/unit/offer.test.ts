/**
 * @file match-flow unit tests — `selectOffer` (the per-round random category subset).
 * Pure helper, tested with a seeded RNG for determinism (no real room ctx).
 */
import { describe, expect, it } from "vitest";
import { type OfferItem, selectOffer } from "../../offer";

/** Build an availability list of `n` categories, marking the ids in `exhaustedIds` as exhausted. */
function avail(n: number, exhaustedIds: readonly string[] = []): OfferItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Category ${i}`,
    emoji: "🎲",
    exhausted: exhaustedIds.includes(`c${i}`)
  }));
}

/** A deterministic RNG: cycles a fixed sequence so shuffles are reproducible across runs. */
function seededRng(seq: readonly number[]): () => number {
  let i = 0;
  return () => {
    const value = seq[i % seq.length] ?? 0;
    i += 1;
    return value;
  };
}

describe("selectOffer", () => {
  it("returns exactly `count` categories when the pool is larger", () => {
    const result = selectOffer(avail(20), 6, seededRng([0.1, 0.7, 0.3, 0.9, 0.5]));
    expect(result).toHaveLength(6);
  });

  it("returns the whole pool (shuffled) when count >= pool size", () => {
    const pool = avail(4);
    const result = selectOffer(pool, 6, seededRng([0.2, 0.8, 0.4, 0.6]));
    expect(result).toHaveLength(4);
    expect(new Set(result.map(c => c.id))).toEqual(new Set(pool.map(c => c.id)));
  });

  it("prefers playable (non-exhausted) categories", () => {
    // 8 categories, 4 exhausted; offering 4 must pick only the 4 playable ones.
    const result = selectOffer(
      avail(8, ["c0", "c1", "c2", "c3"]),
      4,
      seededRng([0.3, 0.6, 0.1, 0.9])
    );
    expect(result).toHaveLength(4);
    expect(result.every(c => !c.exhausted)).toBe(true);
  });

  it("fills the remainder with exhausted categories when too few are playable", () => {
    // Only 2 playable but 4 requested → 2 playable + 2 exhausted fillers.
    const result = selectOffer(
      avail(6, ["c2", "c3", "c4", "c5"]),
      4,
      seededRng([0.5, 0.2, 0.8, 0.4])
    );
    expect(result).toHaveLength(4);
    expect(result.filter(c => !c.exhausted)).toHaveLength(2);
  });

  it("returns no duplicates", () => {
    const result = selectOffer(avail(20), 6, seededRng([0.11, 0.42, 0.73, 0.24, 0.95, 0.06]));
    expect(new Set(result.map(c => c.id)).size).toBe(result.length);
  });

  it("handles an empty pool", () => {
    expect(selectOffer([], 6)).toEqual([]);
  });
});
