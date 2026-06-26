import { describe, expect, it } from "vitest";
import { rank } from "../../src/lib/leaderboard";
import type { ScoreEntry } from "../../src/lib/types";

/** Build a score entry with sensible defaults for the field under test. */
function entry(peerId: string, total: number, prevRank: number): ScoreEntry {
  return { peerId, total, delta: 0, rank: prevRank, prevRank };
}

describe("leaderboard.rank", () => {
  it("sorts by total descending and assigns 1-based ranks", () => {
    const ranked = rank([entry("a", 200, 2), entry("b", 500, 1), entry("c", 100, 3)]);
    expect(ranked.map(e => e.peerId)).toEqual(["b", "a", "c"]);
    expect(ranked.map(e => e.rank)).toEqual([1, 2, 3]);
  });

  it("carries each entry's incoming rank into prevRank (for the reorder animation)", () => {
    // Mia (incoming rank 3) overtakes Sam (incoming rank 2).
    const ranked = rank([entry("sam", 3600, 2), entry("mia", 3800, 3), entry("alex", 4200, 1)]);
    const mia = ranked.find(e => e.peerId === "mia");
    expect(mia?.rank).toBe(2);
    expect(mia?.prevRank).toBe(3);
    expect(mia && mia.rank < mia.prevRank).toBe(true);
  });

  it("keeps ties in their incoming order (stable) and does not mutate the input", () => {
    const input = [entry("x", 100, 1), entry("y", 100, 2)];
    const ranked = rank(input);
    expect(ranked.map(e => e.peerId)).toEqual(["x", "y"]);
    expect(input[0]?.rank).toBe(1); // input untouched
  });

  it("handles an empty board", () => {
    expect(rank([])).toEqual([]);
  });
});
