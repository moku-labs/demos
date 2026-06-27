import { describe, expect, expectTypeOf, it } from "vitest";
import type { CategoryId, PeerId, ScoreEntry, Tier } from "../../../../lib/types";
import {
  computeAward,
  computeEndStats,
  computeLeaderboard,
  rebindScore,
  resetBoard
} from "../../api";
import { createScoringState } from "../../state";
import type { Config, EndStats, PlayerStats, State } from "../../types";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Config = {
  basePoints: { easy: 100, medium: 200, hard: 300 },
  stealFraction: 0.5
};

const PEER_A = "peer-a" as PeerId;
const PEER_B = "peer-b" as PeerId;
const PEER_C = "peer-c" as PeerId;

/**
 * Build a fresh state + entries pair and a helper that runs one award.
 * Returns the new entries array from computeAward for assertions.
 */
const makeBoard = (config?: Partial<Config>) => {
  const state: State = createScoringState();
  const entries = new Map<PeerId, ScoreEntry>();
  const cfg: Config = { ...DEFAULT_CONFIG, ...config };

  const award = (
    peerId: PeerId,
    opts: { correct: boolean; steal: boolean; tier: Tier; category: CategoryId }
  ) => computeAward(state, entries, cfg, peerId, opts);

  return { state, entries, cfg, award };
};

// ─────────────────────────────────────────────────────────────────────────────
// createScoringState
// ─────────────────────────────────────────────────────────────────────────────

describe("createScoringState", () => {
  it("returns an empty Map", () => {
    const state = createScoringState();
    expect(state).toBeInstanceOf(Map);
    expect(state.size).toBe(0);
  });

  it("type is State (Map<PeerId, PlayerStats>)", () => {
    const state = createScoringState();
    expectTypeOf(state).toEqualTypeOf<State>();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — correct answer per tier
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — tier points", () => {
  it("awards basePoints[easy] = 100 for a correct easy answer (no steal)", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, {
      correct: true,
      steal: false,
      tier: "easy",
      category: "animals"
    });
    const entry = result.find(e => e.peerId === PEER_A);
    expect(entry?.delta).toBe(100);
    expect(entry?.total).toBe(100);
  });

  it("awards basePoints[medium] = 200 for a correct medium answer (no steal)", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, {
      correct: true,
      steal: false,
      tier: "medium",
      category: "space"
    });
    expect(result.find(e => e.peerId === PEER_A)?.delta).toBe(200);
  });

  it("awards basePoints[hard] = 300 for a correct hard answer (no steal)", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, { correct: true, steal: false, tier: "hard", category: "music" });
    expect(result.find(e => e.peerId === PEER_A)?.delta).toBe(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — stealFraction rounding
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — stealFraction", () => {
  it("awards Math.round(200 * 0.5) = 100 for steal+correct on medium", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, { correct: true, steal: true, tier: "medium", category: "food" });
    expect(result.find(e => e.peerId === PEER_A)?.delta).toBe(100);
  });

  it("awards Math.round(300 * 0.5) = 150 for steal+correct on hard", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, { correct: true, steal: true, tier: "hard", category: "strange" });
    expect(result.find(e => e.peerId === PEER_A)?.delta).toBe(150);
  });

  it("rounds steal points correctly when fraction yields a non-integer", () => {
    // custom easy=75, steal fraction 0.3 → round(75*0.3)=round(22.5)=23
    const { award } = makeBoard({
      basePoints: { easy: 75, medium: 200, hard: 300 },
      stealFraction: 0.3
    });
    const result = award(PEER_A, { correct: true, steal: true, tier: "easy", category: "animals" });
    expect(result.find(e => e.peerId === PEER_A)?.delta).toBe(23);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — wrong answer = 0 points
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — wrong answer", () => {
  it("awards 0 points for a wrong answer", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, {
      correct: false,
      steal: false,
      tier: "easy",
      category: "animals"
    });
    expect(result.find(e => e.peerId === PEER_A)?.delta).toBe(0);
  });

  it("awards 0 points for a wrong steal attempt", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, {
      correct: false,
      steal: true,
      tier: "hard",
      category: "movies-tv"
    });
    expect(result.find(e => e.peerId === PEER_A)?.delta).toBe(0);
  });

  it("wrong answer still creates the peer entry (total stays 0)", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, {
      correct: false,
      steal: false,
      tier: "easy",
      category: "animals"
    });
    const entry = result.find(e => e.peerId === PEER_A);
    expect(entry).toBeDefined();
    expect(entry?.total).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — streak tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — streak tracking", () => {
  it("extends curStreak on correct answer and updates bestStreak", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    const stats = state.get(PEER_A);
    expect(stats?.curStreak).toBe(2);
    expect(stats?.bestStreak).toBe(2);
  });

  it("resets curStreak to 0 on wrong answer, preserving bestStreak", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: false, steal: false, tier: "easy", category: "animals" });
    const stats = state.get(PEER_A);
    expect(stats?.curStreak).toBe(0);
    expect(stats?.bestStreak).toBe(2);
  });

  it("bestStreak tracks the peak across resets", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: false, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    const stats = state.get(PEER_A);
    expect(stats?.bestStreak).toBe(3);
    expect(stats?.curStreak).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — steals counter
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — steals counter", () => {
  it("increments steals counter only when steal && correct", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: true, tier: "easy", category: "animals" });
    expect(state.get(PEER_A)?.steals).toBe(1);
  });

  it("does NOT increment steals counter for wrong steal", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: false, steal: true, tier: "easy", category: "animals" });
    expect(state.get(PEER_A)?.steals).toBe(0);
  });

  it("does NOT increment steals counter for non-steal correct", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    expect(state.get(PEER_A)?.steals).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — perCategory tracking
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — perCategory", () => {
  it("increments perCategory for correct answers", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "space" });
    const stats = state.get(PEER_A);
    expect(stats?.perCategory.animals).toBe(2);
    expect(stats?.perCategory.space).toBe(1);
  });

  it("increments perCategory for steal+correct answers", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: true, tier: "easy", category: "music" });
    expect(state.get(PEER_A)?.perCategory.music).toBe(1);
  });

  it("does NOT increment perCategory for wrong answers", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: false, steal: false, tier: "easy", category: "animals" });
    expect(state.get(PEER_A)?.perCategory.animals).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — synced end-stats (topCategory + bestStreak on the entry)
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — synced end-stats on the entry", () => {
  it("stamps topCategory + bestStreak on the awarded peer's entry", () => {
    const { award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    const result = award(PEER_A, { correct: true, steal: false, tier: "easy", category: "space" });
    const entry = result.find(e => e.peerId === PEER_A);
    expect(entry?.topCategory).toBe("animals"); // 2 animals > 1 space
    expect(entry?.bestStreak).toBe(3);
  });

  it("keeps bestStreak at its peak after a wrong answer breaks the run", () => {
    const { award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    const result = award(PEER_A, {
      correct: false,
      steal: false,
      tier: "easy",
      category: "animals"
    });
    expect(result.find(e => e.peerId === PEER_A)?.bestStreak).toBe(2);
  });

  it("a peer with no correct answers carries topCategory null and bestStreak 0", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, {
      correct: false,
      steal: false,
      tier: "easy",
      category: "animals"
    });
    const entry = result.find(e => e.peerId === PEER_A);
    expect(entry?.topCategory).toBeNull();
    expect(entry?.bestStreak).toBe(0);
  });

  it("re-stamps every peer's stats on each publish (B keeps its own after A's award)", () => {
    const { award } = makeBoard();
    award(PEER_B, { correct: true, steal: false, tier: "easy", category: "music" }); // B: music, streak 1
    const result = award(PEER_A, { correct: true, steal: false, tier: "easy", category: "food" });
    const bEntry = result.find(e => e.peerId === PEER_B);
    expect(bEntry?.topCategory).toBe("music");
    expect(bEntry?.bestStreak).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — rank + prevRank
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — rank + prevRank", () => {
  it("assigns rank 1 to the only player", () => {
    const { award } = makeBoard();
    const result = award(PEER_A, {
      correct: true,
      steal: false,
      tier: "easy",
      category: "animals"
    });
    expect(result.find(e => e.peerId === PEER_A)?.rank).toBe(1);
  });

  it("assigns rank 1 to highest total and rank 2 to second player", () => {
    const { award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "medium", category: "animals" }); // A: 200
    award(PEER_B, { correct: false, steal: false, tier: "easy", category: "space" }); // B: 0
    const result = award(PEER_B, { correct: true, steal: false, tier: "hard", category: "space" }); // B: 300

    const aEntry = result.find(e => e.peerId === PEER_A);
    const bEntry = result.find(e => e.peerId === PEER_B);
    expect(bEntry?.rank).toBe(1); // B: 300 > A: 200
    expect(aEntry?.rank).toBe(2);
  });

  it("captures prevRank before recompute so rank-swap animations work", () => {
    const { award } = makeBoard();
    // A scores first → rank 1
    const afterA = award(PEER_A, {
      correct: true,
      steal: false,
      tier: "easy",
      category: "animals"
    });
    const priorARank = afterA.find(e => e.peerId === PEER_A)?.rank ?? 1; // 1

    // B overtakes A → A drops to rank 2, prevRank should be 1
    const afterB = award(PEER_B, { correct: true, steal: false, tier: "hard", category: "space" });
    const aAfter = afterB.find(e => e.peerId === PEER_A);
    expect(aAfter?.prevRank).toBe(priorARank); // 1
    expect(aAfter?.rank).toBe(2);
  });

  it("tied players receive the same rank", () => {
    const { award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // 100
    const result = award(PEER_B, { correct: true, steal: false, tier: "easy", category: "space" }); // 100
    const aEntry = result.find(e => e.peerId === PEER_A);
    const bEntry = result.find(e => e.peerId === PEER_B);
    expect(aEntry?.rank).toBe(bEntry?.rank);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAward — running totals
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAward — running totals", () => {
  it("accumulates totals across multiple awards", () => {
    const { award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // 100
    const result = award(PEER_A, {
      correct: true,
      steal: false,
      tier: "medium",
      category: "animals"
    }); // 200
    expect(result.find(e => e.peerId === PEER_A)?.total).toBe(300);
  });

  it("delta reflects only the current round's points", () => {
    const { award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // +100
    const result = award(PEER_A, {
      correct: true,
      steal: false,
      tier: "medium",
      category: "animals"
    }); // +200
    const entry = result.find(e => e.peerId === PEER_A);
    expect(entry?.delta).toBe(200); // last round only
    expect(entry?.total).toBe(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resetBoard
// ─────────────────────────────────────────────────────────────────────────────

describe("resetBoard", () => {
  it("zeros all totals/deltas/ranks in the entries map", () => {
    const { state, entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_B, { correct: true, steal: false, tier: "hard", category: "space" });

    const result = resetBoard(state, entries);
    expect(result.every(e => e.total === 0 && e.delta === 0 && e.rank === 0)).toBe(true);
  });

  it("clears host-internal stats (steals, streaks, perCategory)", () => {
    const { state, entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: true, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });

    resetBoard(state, entries);

    const stats = state.get(PEER_A);
    expect(stats?.steals).toBe(0);
    expect(stats?.curStreak).toBe(0);
    expect(stats?.bestStreak).toBe(0);
    expect(Object.keys(stats?.perCategory ?? {}).length).toBe(0);
  });

  it("returns a zeroed entries snapshot", () => {
    const { state, entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    const zeroed = resetBoard(state, entries);
    expect(zeroed.every(e => e.total === 0)).toBe(true);
  });

  it("preserves peer entries (peerId stays in snapshot after reset)", () => {
    const { state, entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    const zeroed = resetBoard(state, entries);
    expect(zeroed.some(e => e.peerId === PEER_A)).toBe(true);
  });

  it("clears the synced stat fields (topCategory null, bestStreak 0) in the snapshot", () => {
    const { state, entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    const zeroed = resetBoard(state, entries);
    const entry = zeroed.find(e => e.peerId === PEER_A);
    expect(entry?.topCategory).toBeNull();
    expect(entry?.bestStreak).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeLeaderboard
// ─────────────────────────────────────────────────────────────────────────────

describe("computeLeaderboard", () => {
  it("returns an empty readonly array when no entries", () => {
    const entries = new Map<PeerId, ScoreEntry>();
    const result = computeLeaderboard(entries);
    expect(result).toHaveLength(0);
    expectTypeOf(result).toEqualTypeOf<readonly ScoreEntry[]>();
  });

  it("returns entries sorted by total descending", () => {
    const { entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // 100
    award(PEER_B, { correct: true, steal: false, tier: "hard", category: "space" }); // 300
    award(PEER_C, { correct: true, steal: false, tier: "medium", category: "music" }); // 200

    const lb = computeLeaderboard(entries);
    expect(lb[0]?.peerId).toBe(PEER_B); // 300
    expect(lb[1]?.peerId).toBe(PEER_C); // 200
    expect(lb[2]?.peerId).toBe(PEER_A); // 100
  });

  it("does not mutate the entries map order", () => {
    const { entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // 100
    award(PEER_B, { correct: true, steal: false, tier: "hard", category: "space" }); // 300
    computeLeaderboard(entries);
    // entries Map insertion order should still be A then B
    expect([...entries.keys()][0]).toBe(PEER_A);
    expect([...entries.keys()][1]).toBe(PEER_B);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeEndStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeEndStats", () => {
  it("returns undefined for mostSteals and highestStreak when no awards", () => {
    const state = createScoringState();
    const stats = computeEndStats(state);
    expect(stats.mostSteals).toBeUndefined();
    expect(stats.highestStreak).toBeUndefined();
    expect(stats.topCategory).toEqual({});
  });

  it("returns the correct mostSteals winner", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: true, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: true, tier: "easy", category: "animals" });
    award(PEER_B, { correct: true, steal: true, tier: "easy", category: "animals" });

    const stats = computeEndStats(state);
    expect(stats.mostSteals?.peerId).toBe(PEER_A);
    expect(stats.mostSteals?.count).toBe(2);
  });

  it("returns undefined for mostSteals when no player has any steals", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    expect(computeEndStats(state).mostSteals).toBeUndefined();
  });

  it("returns the correct highestStreak winner", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // streak 3
    award(PEER_B, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_B, { correct: true, steal: false, tier: "easy", category: "animals" }); // streak 2

    const stats = computeEndStats(state);
    expect(stats.highestStreak?.peerId).toBe(PEER_A);
    expect(stats.highestStreak?.streak).toBe(3);
  });

  it("returns undefined for highestStreak when no player has any streak", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: false, steal: false, tier: "easy", category: "animals" });
    expect(computeEndStats(state).highestStreak).toBeUndefined();
  });

  it("returns the top category per player", () => {
    const { state, award } = makeBoard();
    // A: 2 animals, 1 space → top = animals
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" });
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "space" });
    // B: 1 music → top = music
    award(PEER_B, { correct: true, steal: false, tier: "easy", category: "music" });

    const stats = computeEndStats(state);
    expect(stats.topCategory[PEER_A]).toBe("animals");
    expect(stats.topCategory[PEER_B]).toBe("music");
  });

  it("returns undefined topCategory for a player who has no correct answers", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: false, steal: false, tier: "easy", category: "animals" });
    const stats = computeEndStats(state);
    // peer was seeded in state by the wrong award; topCategory is undefined (no correct answers)
    expect(stats.topCategory[PEER_A]).toBeUndefined();
  });

  it("handles tie in mostSteals (takes first encountered)", () => {
    const { state, award } = makeBoard();
    award(PEER_A, { correct: true, steal: true, tier: "easy", category: "animals" });
    award(PEER_B, { correct: true, steal: true, tier: "easy", category: "animals" });

    const stats = computeEndStats(state);
    expect(stats.mostSteals?.count).toBe(1);
    expect([PEER_A, PEER_B] as PeerId[]).toContain(stats.mostSteals?.peerId);
  });

  it("type of computeEndStats return is EndStats", () => {
    const state = createScoringState();
    expectTypeOf(computeEndStats(state)).toEqualTypeOf<EndStats>();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-level assertions
// ─────────────────────────────────────────────────────────────────────────────

describe("types", () => {
  it("Config has basePoints and stealFraction", () => {
    const cfg: Config = {
      basePoints: { easy: 100, medium: 200, hard: 300 },
      stealFraction: 0.5
    };
    expectTypeOf(cfg.basePoints).toEqualTypeOf<Readonly<Record<Tier, number>>>();
    expectTypeOf(cfg.stealFraction).toEqualTypeOf<number>();
  });

  it("State is a Map of PeerId to PlayerStats", () => {
    const state = createScoringState();
    expectTypeOf(state).toEqualTypeOf<Map<PeerId, PlayerStats>>();
  });

  it("computeAward returns ScoreEntry[]", () => {
    const state = createScoringState();
    const entries = new Map<PeerId, ScoreEntry>();
    const result = computeAward(state, entries, DEFAULT_CONFIG, PEER_A, {
      correct: true,
      steal: false,
      tier: "easy",
      category: "animals"
    });
    expectTypeOf(result).toEqualTypeOf<ScoreEntry[]>();
  });

  it("computeLeaderboard returns readonly ScoreEntry[]", () => {
    const entries = new Map<PeerId, ScoreEntry>();
    expectTypeOf(computeLeaderboard(entries)).toEqualTypeOf<readonly ScoreEntry[]>();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rebindScore — phone reconnect re-keys score + stats old→new peerId
// ─────────────────────────────────────────────────────────────────────────────

describe("rebindScore", () => {
  it("migrates an existing score row + stats from the old peerId to the new one", () => {
    const { state, entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "medium", category: "animals" }); // +200
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // +100

    const rows = rebindScore(state, entries, PEER_A, PEER_B);

    // Old key is gone; new key carries the same total + the re-keyed peerId.
    expect(entries.has(PEER_A)).toBe(false);
    expect(entries.get(PEER_B)?.total).toBe(300);
    expect(entries.get(PEER_B)?.peerId).toBe(PEER_B);
    expect(state.has(PEER_A)).toBe(false);
    expect(state.get(PEER_B)).toBeDefined();
    // The re-published board reflects the new key.
    expect(rows?.some(r => r.peerId === PEER_B && r.total === 300)).toBe(true);
    expect(rows?.some(r => r.peerId === PEER_A)).toBe(false);
  });

  it("is a no-op (undefined rows) when the player never scored", () => {
    const { state, entries } = makeBoard();
    const rows = rebindScore(state, entries, PEER_A, PEER_B);
    expect(rows).toBeUndefined();
    expect(entries.size).toBe(0);
  });

  it("is a no-op when old and new peerId are equal", () => {
    const { state, entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "hard", category: "space" });
    const rows = rebindScore(state, entries, PEER_A, PEER_A);
    expect(rows).toBeUndefined();
    expect(entries.get(PEER_A)?.total).toBe(300);
  });

  it("does not disturb other players' scores", () => {
    const { state, entries, award } = makeBoard();
    award(PEER_A, { correct: true, steal: false, tier: "easy", category: "animals" }); // A +100
    award(PEER_C, { correct: true, steal: false, tier: "hard", category: "space" }); // C +300

    rebindScore(state, entries, PEER_A, PEER_B);

    expect(entries.get(PEER_C)?.total).toBe(300);
    expect(entries.get(PEER_B)?.total).toBe(100);
    expect(entries.has(PEER_A)).toBe(false);
  });
});
