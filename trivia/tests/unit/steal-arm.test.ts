/**
 * @file Unit tests for the phone-local steal lead-in anchor (`nextStealArmAt`).
 *
 * The controller lifecycle bypasses the e2e fixtures (those inject `stealArmAt` directly), so this is the
 * deterministic coverage for the anchor's "anchor once → keep → clear" behaviour — the logic that replaced
 * the phone's dependency on the host's lossy `armed` sync frame (the reported steal-lock bug).
 */
/* eslint-disable unicorn/no-null -- deliberately exercises `null` inputs: `ctx.state.stealArmAt` is a
   nullable island-state cell, so the anchor MUST handle a literal `null` (not just `undefined`). */
import { describe, expect, it } from "vitest";
import { TRIVIA } from "../../src/config";
import { nextStealArmAt } from "../../src/islands/controller/steal-arm";

describe("nextStealArmAt (phone-local steal lead-in anchor)", () => {
  it("returns null when no steal is open — clears the anchor so the next steal re-anchors", () => {
    expect(nextStealArmAt(null, false, 1000, 1000)).toBeNull();
    // Even if a prior steal had anchored it, a closed steal resets to null.
    expect(nextStealArmAt(5000, false, 1000, 1000)).toBeNull();
  });

  it("anchors `now + leadMs` the first time the steal is seen (prev nullish)", () => {
    expect(nextStealArmAt(null, true, 1000, 1000)).toBe(2000);
    expect(nextStealArmAt(undefined, true, 1000, 1000)).toBe(2000);
  });

  it("keeps the existing anchor while the steal stays open, even as `now` advances (idempotent)", () => {
    // The countdown is fixed at anchor time — later observations must NOT push it forward.
    expect(nextStealArmAt(2000, true, 1500, 1000)).toBe(2000);
    expect(nextStealArmAt(2000, true, 9999, 1000)).toBe(2000);
  });

  it("defaults leadMs to TRIVIA.timers.stealLeadMs", () => {
    expect(nextStealArmAt(null, true, 1000)).toBe(1000 + TRIVIA.timers.stealLeadMs);
  });
});
