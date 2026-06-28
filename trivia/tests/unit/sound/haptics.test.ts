/**
 * @file Unit tests for pure haptic resolution (`src/lib/sound/haptics.ts`). The load-bearing guarantee: a
 * haptic fires only when it should (not muted AND the Vibration API exists — iOS Safari has none), and
 * every cue has a non-empty pattern.
 */
import { describe, expect, it } from "vitest";
import { HAPTIC_PATTERNS, resolveHaptic } from "../../../src/lib/sound/haptics";
import type { HapticId } from "../../../src/lib/sound/types";

const IDS: HapticId[] = ["confirm", "lockin", "correct", "wrong", "nudge"];

describe("HAPTIC_PATTERNS", () => {
  it("defines a non-empty ms pattern for every haptic id", () => {
    for (const id of IDS) {
      const pattern = HAPTIC_PATTERNS[id];
      expect(pattern.length).toBeGreaterThan(0);
      expect(pattern.every(ms => ms > 0)).toBe(true);
    }
  });
});

describe("resolveHaptic", () => {
  it("returns the pattern when un-muted and supported", () => {
    expect(resolveHaptic("correct", { muted: false, supported: true })).toEqual([25, 40, 25]);
  });

  it("returns undefined when muted", () => {
    expect(resolveHaptic("correct", { muted: true, supported: true })).toBeUndefined();
  });

  it("returns undefined when the Vibration API is unsupported (e.g. iOS Safari)", () => {
    expect(resolveHaptic("lockin", { muted: false, supported: false })).toBeUndefined();
  });
});
