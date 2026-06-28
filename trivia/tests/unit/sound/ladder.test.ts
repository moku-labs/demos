/**
 * @file Unit tests for the pure pitch-ladder math (`src/lib/sound/ladder.ts`). These ratios make one
 * sample feel like many (a rising lobby, a climbing streak, a brighter overtake), so the invariants are:
 * correct equal-temperament ratios, monotonic non-decreasing ladders, and clamping at the ends.
 */
import { describe, expect, it } from "vitest";
import { joinRate, overtakeRate, semitonesToRate, streakRate } from "../../../src/lib/sound/ladder";

describe("semitonesToRate", () => {
  it("maps an octave to 2×, unison to 1, and an octave down to 0.5", () => {
    expect(semitonesToRate(0)).toBe(1);
    expect(semitonesToRate(12)).toBeCloseTo(2, 10);
    expect(semitonesToRate(-12)).toBeCloseTo(0.5, 10);
  });
});

describe("joinRate", () => {
  it("starts at base pitch for the first join", () => {
    expect(joinRate(0)).toBe(1);
  });

  it("rises monotonically with join order", () => {
    const rates = [0, 1, 2, 3, 4].map(index => joinRate(index));
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1] as number);
    }
  });

  it("clamps a negative or out-of-range index instead of throwing", () => {
    expect(joinRate(-5)).toBe(1);
    expect(Number.isFinite(joinRate(999))).toBe(true);
  });
});

describe("streakRate", () => {
  it("is the base rate for the first correct (streak 0 or 1)", () => {
    expect(streakRate(0)).toBe(1);
    expect(streakRate(1)).toBe(1);
  });

  it("climbs with the streak and then caps", () => {
    expect(streakRate(3)).toBeGreaterThan(streakRate(2));
    expect(streakRate(50)).toBe(streakRate(7));
  });
});

describe("overtakeRate", () => {
  it("is the base rate for no climb and brightens with positions gained", () => {
    expect(overtakeRate(0)).toBe(1);
    expect(overtakeRate(2)).toBeGreaterThan(overtakeRate(1));
  });

  it("caps a huge jump at the four-position rate", () => {
    expect(overtakeRate(99)).toBe(overtakeRate(4));
  });
});
