import { describe, expect, it } from "vitest";
import type { PlayerProfile } from "../../src/lib/types";
import { categoryMeta, findPlayer, formatScore, secondsLeft, slotMeta } from "../../src/lib/view";

/** A minimal player profile for lookup tests. */
function player(peerId: string): PlayerProfile {
  return { peerId, name: peerId, color: "#fff", avatar: "🦊", connected: true, isHost: false };
}

describe("view.slotMeta", () => {
  it("maps slot indices to the fixed letter/shape/colour", () => {
    expect(slotMeta(0)).toMatchObject({ letter: "A", shape: "▲" });
    expect(slotMeta(3)).toMatchObject({ letter: "D", shape: "■" });
  });

  it("falls back to slot A for out-of-range indices", () => {
    expect(slotMeta(9)).toMatchObject({ letter: "A" });
    expect(slotMeta(-1)).toMatchObject({ letter: "A" });
  });
});

describe("view.categoryMeta", () => {
  it("resolves a known category's name + emoji", () => {
    expect(categoryMeta("animals")).toMatchObject({ emoji: "🦎" });
  });

  it("falls back to the id as the name for an unknown category", () => {
    expect(categoryMeta("mystery")).toEqual({ id: "mystery", name: "mystery", emoji: "" });
  });
});

describe("view.secondsLeft", () => {
  it("returns whole seconds remaining, rounded up", () => {
    expect(secondsLeft(10_400, 6000)).toBe(5);
  });

  it("clamps to 0 once the deadline has passed", () => {
    expect(secondsLeft(1000, 5000)).toBe(0);
  });

  it("returns 0 when there is no deadline", () => {
    // eslint-disable-next-line unicorn/no-null -- the no-deadline branch keys off a `null` deadlineTs
    expect(secondsLeft(null, 5000)).toBe(0);
  });
});

describe("view.findPlayer", () => {
  const roster = [player("a"), player("b")];

  it("finds a player by peer id", () => {
    expect(findPlayer(roster, "b")?.peerId).toBe("b");
  });

  it("returns undefined for a missing or absent id", () => {
    expect(findPlayer(roster, "z")).toBeUndefined();
    expect(findPlayer(roster, undefined)).toBeUndefined();
  });
});

describe("view.formatScore", () => {
  it("groups thousands", () => {
    expect(formatScore(4200)).toBe("4,200");
    expect(formatScore(0)).toBe("0");
  });
});
