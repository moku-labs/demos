/**
 * The scoreboard derivation schema, executable — every `S#` case from
 * `spec/scoreboard-animation.md` §4 plus the invariants (§3) pinned as unit tests. Player letters
 * match the spec (roster/join order = declaration order).
 */
import { describe, expect, it } from "vitest";
import { type BoardRow, boardRows, maxClimb } from "../../src/lib/leaderboard";
import type { PlayerProfile, ScoreEntry } from "../../src/lib/types";

/** Build a score entry — only `total`/`delta` matter to the derivation (rank fields are ignored). */
function entry(peerId: string, total: number, delta = 0): ScoreEntry {
  return { peerId, total, delta, rank: 0, prevRank: 0 };
}

/** Build a connected player profile. */
function player(peerId: string, connected = true): PlayerProfile {
  return {
    peerId,
    name: peerId.toUpperCase(),
    color: "#fff",
    avatar: "🙂",
    connected,
    isHost: false
  };
}

/** The display order (post-round), as peer ids. */
function order(rows: readonly BoardRow[]): string[] {
  return rows.map(row => row.entry.peerId);
}

/** The pre-round order, as peer ids (rows re-sorted by prevPosition). */
function preOrder(rows: readonly BoardRow[]): string[] {
  return rows.toSorted((a, b) => a.prevPosition - b.prevPosition).map(row => row.entry.peerId);
}

/** Assert §I1: `position` and `prevPosition` are each a permutation of 0..N−1 (no shared slots). */
function expectUniqueSlots(rows: readonly BoardRow[]): void {
  const slots = [...rows.keys()];
  expect(rows.map(row => row.position).toSorted((a, b) => a - b)).toEqual(slots);
  expect(rows.map(row => row.prevPosition).toSorted((a, b) => a - b)).toEqual(slots);
}

describe("boardRows — unique resolved ranks (§I2/§I4, product decision 2026-07-03)", () => {
  it("labels are ALWAYS unique 1..N — a tie never shows a shared number", () => {
    const players = [player("a"), player("b"), player("c"), player("d")];
    const tieShapes: ScoreEntry[][] = [
      [entry("a", 400), entry("b", 400), entry("c", 400), entry("d", 400)], // all tied
      [entry("a", 500), entry("b", 400), entry("c", 400), entry("d", 100)], // middle tie group
      [entry("a", 0), entry("b", 0), entry("c", 0), entry("d", 0)] // all-zero start
    ];
    for (const scores of tieShapes) {
      const rows = boardRows(players, scores);
      expect(rows.map(r => r.rankLabel)).toEqual([1, 2, 3, 4]);
      expect(new Set(rows.map(r => r.prevRankLabel)).size).toBe(rows.length);
    }
  });

  it("first to reach a score DEFENDS the rank: the incumbent stays ahead of a later tier", () => {
    // A held 400 before the round; B (+300) reaches 400 this round → A keeps rank 1, B ranks 2.
    const rows = boardRows([player("a"), player("b")], [entry("a", 400), entry("b", 400, 300)]);
    expect(rows.map(r => [r.entry.peerId, r.rankLabel])).toEqual([
      ["a", 1],
      ["b", 2]
    ]);
  });
});

describe("boardRows — the case matrix (spec §4)", () => {
  const abc = [player("a"), player("b"), player("c")];

  it("S1 single overtake: B (+200) slides past A; C holds; badgeable climb on B only", () => {
    const rows = boardRows(abc, [entry("a", 300), entry("b", 400, 200), entry("c", 100)]);
    expect(preOrder(rows)).toEqual(["a", "b", "c"]);
    expect(order(rows)).toEqual(["b", "a", "c"]);
    expectUniqueSlots(rows);
    const b = rows.find(r => r.entry.peerId === "b");
    expect(b).toMatchObject({ prevPosition: 1, position: 0 });
    expect(rows.map(r => r.rankLabel)).toEqual([1, 2, 3]);
    expect(maxClimb(rows)).toBe(1);
  });

  it("S2 multi-slot climb: C (+400) jumps two slots to the top", () => {
    const rows = boardRows(abc, [entry("a", 300), entry("b", 250), entry("c", 500, 400)]);
    expect(preOrder(rows)).toEqual(["a", "b", "c"]);
    expect(order(rows)).toEqual(["c", "a", "b"]);
    expectUniqueSlots(rows);
    expect(rows.find(r => r.entry.peerId === "c")).toMatchObject({ prevPosition: 2, position: 0 });
    expect(maxClimb(rows)).toBe(2);
  });

  it("S3 gain without a rank change: the leader extends — zero motion", () => {
    const rows = boardRows(abc.slice(0, 2), [entry("a", 500, 100), entry("b", 300)]);
    expect(order(rows)).toEqual(["a", "b"]);
    for (const row of rows) expect(row.position).toBe(row.prevPosition);
    expect(maxClimb(rows)).toBe(0);
  });

  it("S4 tie formed — the EXCEED rule (§I2): reaching a score never passes it (the overlap bug case)", () => {
    const rows = boardRows(abc.slice(0, 2), [entry("a", 400), entry("b", 400, 300)]);
    expect(order(rows)).toEqual(["a", "b"]); // B tied A but does NOT pass — A defends
    expectUniqueSlots(rows); // …and the two rows NEVER share a slot
    for (const row of rows) expect(row.position).toBe(row.prevPosition);
    expect(rows.map(r => r.rankLabel)).toEqual([1, 2]); // unique resolved ranks — never "1, 1"
    expect(rows.map(r => r.prevRankLabel)).toEqual([1, 2]);
  });

  it("S5 tie broken: the tied challenger who EXCEEDS does slide past", () => {
    const rows = boardRows(abc.slice(0, 2), [entry("a", 400), entry("b", 500, 100)]);
    expect(preOrder(rows)).toEqual(["a", "b"]); // were tied at 400 — join order held
    expect(order(rows)).toEqual(["b", "a"]);
    expect(rows.find(r => r.entry.peerId === "b")).toMatchObject({ prevPosition: 1, position: 0 });
  });

  it("S6 multi-way tie: distinct slots, unique resolved labels, zero motion", () => {
    const rows = boardRows(abc, [entry("a", 200), entry("b", 200), entry("c", 200)]);
    expect(order(rows)).toEqual(["a", "b", "c"]); // the carried-forward tie order
    expectUniqueSlots(rows);
    for (const row of rows) expect(row.position).toBe(row.prevPosition);
    expect(rows.map(r => r.rankLabel)).toEqual([1, 2, 3]);
  });

  it("S7 multi-mover round (open steal): B and C cross A together, slots distinct throughout", () => {
    const abcd = [...abc, player("d")];
    const rows = boardRows(abcd, [
      entry("a", 100),
      entry("b", 240, 140),
      entry("c", 180, 80),
      entry("d", 60, 60)
    ]);
    expect(preOrder(rows)).toEqual(["a", "b", "c", "d"]); // tie at 100 → join order; D below
    expect(order(rows)).toEqual(["b", "c", "a", "d"]);
    expectUniqueSlots(rows);
    expect(rows.find(r => r.entry.peerId === "b")).toMatchObject({ prevPosition: 1, position: 0 });
    expect(rows.find(r => r.entry.peerId === "c")).toMatchObject({ prevPosition: 2, position: 1 });
    expect(maxClimb(rows)).toBe(1);
  });

  it("S8 climbing INTO a tie group: reaching the group's score joins it below, no motion", () => {
    const rows = boardRows(abc, [entry("a", 400), entry("b", 400), entry("c", 400, 250)]);
    expect(order(rows)).toEqual(["a", "b", "c"]);
    for (const row of rows) expect(row.position).toBe(row.prevPosition);
    expect(rows.map(r => r.rankLabel)).toEqual([1, 2, 3]); // C reached 400 last → ranks 3rd
    expect(rows.find(r => r.entry.peerId === "c")?.prevRankLabel).toBe(3);
  });

  it("S9 climbing out of the all-zero group: zero rows keep their relative order", () => {
    // Only B has a score entry; A + C are connected roster players synthesized at 0.
    const rows = boardRows(abc, [entry("b", 200, 200)]);
    expect(preOrder(rows)).toEqual(["a", "b", "c"]); // all pre-zero → join order
    expect(order(rows)).toEqual(["b", "a", "c"]);
    expectUniqueSlots(rows);
    expect(rows.find(r => r.entry.peerId === "b")).toMatchObject({ prevPosition: 1, position: 0 });
  });

  it("S10 nobody scored: a fully static board", () => {
    const rows = boardRows(abc.slice(0, 2), [entry("a", 300), entry("b", 200)]);
    for (const row of rows) expect(row.position).toBe(row.prevPosition);
    expect(maxClimb(rows)).toBe(0);
  });

  it("S11 mid-match joiner: the fresh zero row appears at the bottom with no phantom slide", () => {
    const joined = [...abc.slice(0, 2), player("j")];
    const rows = boardRows(joined, [entry("a", 300), entry("b", 100)]);
    expect(order(rows)).toEqual(["a", "b", "j"]);
    const j = rows.find(r => r.entry.peerId === "j");
    expect(j).toMatchObject({ position: 2, prevPosition: 2 }); // no movement to animate
  });

  it("S14 a leaver's row drops; the remaining rows still animate contiguously", () => {
    const remaining = [player("a"), player("c")]; // B left the roster
    const rows = boardRows(remaining, [
      entry("a", 300),
      entry("b", 400, 200),
      entry("c", 350, 300)
    ]);
    expect(order(rows)).toEqual(["c", "a"]); // B absent; C still slides past A
    expectUniqueSlots(rows); // contiguous 0..1 — no gap where B was
    expect(rows.find(r => r.entry.peerId === "c")).toMatchObject({ prevPosition: 1, position: 0 });
  });
});

describe("boardRows — roster merging (unchanged behaviours)", () => {
  it("includes a connected player who has NOT scored yet (seeded at 0), never dropping them", () => {
    const players = [player("a"), player("b"), player("c")];
    const rows = boardRows(players, [entry("a", 300), entry("b", 100)]);
    expect(order(rows)).toEqual(["a", "b", "c"]);
    expect(rows.find(r => r.entry.peerId === "c")).toMatchObject({
      entry: { total: 0, delta: 0 },
      position: 2,
      prevPosition: 2,
      rankLabel: 3
    });
  });

  it("does not add a DISCONNECTED player who never scored", () => {
    const players = [player("a"), player("gone", false)];
    const rows = boardRows(players, [entry("a", 100)]);
    expect(rows.some(r => r.entry.peerId === "gone")).toBe(false);
  });

  it("keeps a disconnected player who DID score (their row already exists)", () => {
    const players = [player("a"), player("left", false)];
    const rows = boardRows(players, [entry("a", 100), entry("left", 200)]);
    expect(order(rows)).toEqual(["left", "a"]); // 200 > 100 → still first
  });

  it("handles an empty board", () => {
    expect(boardRows([], [])).toEqual([]);
  });

  it("§I6 determinism: the same snapshot derives the same board on every call", () => {
    const players = [player("a"), player("b"), player("c")];
    const scores = [entry("a", 300), entry("b", 300, 100), entry("c", 300, 300)];
    const first = boardRows(players, scores);
    const second = boardRows(players, scores);
    expect(second).toEqual(first);
    expectUniqueSlots(first);
  });
});
