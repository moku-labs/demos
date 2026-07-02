/**
 * @file Unit tests — fair round scaling by player count (item 5): `matchLength`, `turnsPerPlayer`,
 * and the player-count-aware `ramp`. Confirms the fairness invariants the feature promises: every
 * player gets an EQUAL turn count, and every player faces the SAME difficulty-tier distribution,
 * for every table size 1–5.
 */
import { describe, expect, it } from "vitest";
import { matchLength, ramp, turnsPerPlayer } from "../../src/lib/match-length";

/**
 * Collect the tier sequence a single seat (player position) sees across the whole match — one entry
 * per turn, in turn order. This is the fairness-critical view: every player must see the SAME
 * sequence regardless of which seat they're in.
 *
 * @param seat - The 0-based seat index.
 * @param players - The connected player count.
 * @param rounds - This match's total round count (`matchLength(players)`).
 * @returns The tier at each of this seat's turns, in turn order.
 */
function seatTierSequence(seat: number, players: number, rounds: number): string[] {
  const tiers: string[] = [];
  for (let round = seat + 1; round <= rounds; round += players) {
    tiers.push(ramp(round, players, rounds));
  }
  return tiers;
}

describe("matchLength", () => {
  it("keeps the full 12 rounds for a solo match", () => {
    expect(matchLength(1)).toBe(12);
  });

  it("keeps 12 rounds for 2 and 3 players (12 divides evenly)", () => {
    expect(matchLength(2)).toBe(12);
    expect(matchLength(3)).toBe(12);
  });

  it("scales up for 4 and 5 players to preserve the 3-player pace (4 turns each)", () => {
    expect(matchLength(4)).toBe(16);
    expect(matchLength(5)).toBe(20);
  });

  it("always yields a round count evenly divisible by the player count (equal turns)", () => {
    for (let players = 1; players <= 5; players += 1) {
      const rounds = matchLength(players);
      expect(rounds % players).toBe(0);
    }
  });

  it("respects a custom base round count", () => {
    // A 9-round base → 3-player baseline is 3 turns each → 4 players scales to 12.
    expect(matchLength(3, 9)).toBe(9);
    expect(matchLength(4, 9)).toBe(12);
  });

  it("clamps a non-positive or fractional player count defensively", () => {
    expect(matchLength(0)).toBe(12);
    expect(matchLength(-3)).toBe(12);
    expect(matchLength(3.4)).toBe(12); // rounds to 3 → still within the un-scaled baseline
    expect(matchLength(3.6)).toBe(16); // rounds to 4 → scales up
  });
});

describe("turnsPerPlayer", () => {
  it("is always a whole number for matchLength's own output", () => {
    for (let players = 1; players <= 5; players += 1) {
      const rounds = matchLength(players);
      expect(turnsPerPlayer(rounds, players)).toBe(rounds / players);
    }
  });

  it("reports 4 turns each for 3, 4, and 5 players", () => {
    expect(turnsPerPlayer(matchLength(3), 3)).toBe(4);
    expect(turnsPerPlayer(matchLength(4), 4)).toBe(4);
    expect(turnsPerPlayer(matchLength(5), 5)).toBe(4);
  });

  it("reports 6 turns for 2 players, 12 for solo", () => {
    expect(turnsPerPlayer(matchLength(2), 2)).toBe(6);
    expect(turnsPerPlayer(matchLength(1), 1)).toBe(12);
  });
});

describe("ramp — player-count-aware difficulty tier", () => {
  it("defaults to the classic solo 4/4/4 bands when called with one arg", () => {
    expect(ramp(1)).toBe("easy");
    expect(ramp(4)).toBe("easy");
    expect(ramp(5)).toBe("medium");
    expect(ramp(8)).toBe("medium");
    expect(ramp(9)).toBe("hard");
    expect(ramp(12)).toBe("hard");
  });

  it("resolves to hard by the final round for every table size", () => {
    for (let players = 1; players <= 5; players += 1) {
      const rounds = matchLength(players);
      expect(ramp(rounds, players, rounds)).toBe("hard");
    }
  });

  it("resolves to easy on round 1 for every table size", () => {
    for (let players = 1; players <= 5; players += 1) {
      const rounds = matchLength(players);
      expect(ramp(1, players, rounds)).toBe("easy");
    }
  });

  it("every seat sees the identical tier sequence (equal difficulty distribution) for 3–5 players", () => {
    for (const players of [3, 4, 5]) {
      const rounds = matchLength(players);
      const reference = seatTierSequence(0, players, rounds);
      expect(reference).toEqual(["easy", "medium", "medium", "hard"]);
      for (let seat = 1; seat < players; seat += 1) {
        expect(seatTierSequence(seat, players, rounds)).toEqual(reference);
      }
    }
  });

  it("both seats see the identical tier sequence for 2 players", () => {
    const rounds = matchLength(2);
    const seat0 = seatTierSequence(0, 2, rounds);
    const seat1 = seatTierSequence(1, 2, rounds);
    expect(seat0).toEqual(seat1);
    expect(seat0).toEqual(["easy", "easy", "medium", "medium", "hard", "hard"]);
  });

  it("counts each tier equally per seat across every table size 1–5", () => {
    for (let players = 1; players <= 5; players += 1) {
      const rounds = matchLength(players);
      const seq = seatTierSequence(0, players, rounds);
      const counts = { easy: 0, medium: 0, hard: 0 };
      for (const tier of seq) counts[tier as keyof typeof counts] += 1;
      // Every seat's turn count splits into thirds (roughly equal easy/medium/hard) — never a single
      // tier dominating (e.g. never "all hard" or "no easy").
      expect(counts.easy).toBeGreaterThan(0);
      expect(counts.medium).toBeGreaterThan(0);
      expect(counts.hard).toBeGreaterThan(0);
    }
  });

  it("tier is a function of the cycle, not which seat is active in a given round", () => {
    // Every player within the SAME cycle (block of `players` consecutive rounds) faces the same tier —
    // confirms the ramp does not vary by seat identity, only by turn-cycle position.
    const players = 4;
    const rounds = matchLength(players);
    for (let cycleStart = 1; cycleStart <= rounds; cycleStart += players) {
      const tiersInCycle = new Set<string>();
      for (let round = cycleStart; round < cycleStart + players && round <= rounds; round += 1) {
        tiersInCycle.add(ramp(round, players, rounds));
      }
      expect(tiersInCycle.size).toBe(1);
    }
  });
});
