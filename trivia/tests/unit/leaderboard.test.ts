import { describe, expect, it } from "vitest";
import { rank, standings } from "../../src/lib/leaderboard";
import type { PlayerProfile, ScoreEntry } from "../../src/lib/types";

/** Build a score entry with sensible defaults for the field under test. */
function entry(peerId: string, total: number, prevRank: number): ScoreEntry {
  return { peerId, total, delta: 0, rank: prevRank, prevRank };
}

/** Build a connected player profile. */
function player(peerId: string, connected = true): PlayerProfile {
  return { peerId, name: peerId, color: "#fff", avatar: "🙂", connected, isHost: false };
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

describe("leaderboard.standings — every in-game player appears (bug #2)", () => {
  it("includes a connected player who has NOT scored yet (seeded at 0), never dropping them", () => {
    const players = [player("a"), player("b"), player("c")];
    // Only a + b have score rows; c is connected but never awarded.
    const scores = [entry("a", 300, 1), entry("b", 100, 2)];
    const board = standings(players, scores);
    expect(board.map(e => e.peerId)).toEqual(["a", "b", "c"]);
    const c = board.find(e => e.peerId === "c");
    expect(c?.total).toBe(0);
    expect(c?.delta).toBe(0);
    expect(c?.rank).toBe(3);
  });

  it("does not add a DISCONNECTED player who never scored", () => {
    const players = [player("a"), player("gone", false)];
    const board = standings(players, [entry("a", 100, 1)]);
    expect(board.some(e => e.peerId === "gone")).toBe(false);
  });

  it("keeps a disconnected player who DID score (their row already exists)", () => {
    const players = [player("a"), player("left", false)];
    const board = standings(players, [entry("a", 100, 1), entry("left", 200, 2)]);
    expect(board.find(e => e.peerId === "left")?.total).toBe(200);
    expect(board[0]?.peerId).toBe("left"); // 200 > 100 → ranked first
  });

  it("ranks the merged union by total (zero-score players sink to the bottom)", () => {
    const players = [player("a"), player("b"), player("c")];
    const board = standings(players, [entry("b", 500, 1)]);
    expect(board.map(e => e.peerId)).toEqual(["b", "a", "c"]);
    expect(board.map(e => e.rank)).toEqual([1, 2, 3]); // position-based (rank() does not fold ties)
  });
});
