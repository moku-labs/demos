/**
 * The pure FLIP geometry (spec/scoreboard-animation.md §1): seeds place each tile at its pre-round
 * slot from REAL heights — including unequal rows — and an identity permutation seeds all zeros.
 */
import { describe, expect, it } from "vitest";
import { flipSeedOffsets } from "../../src/lib/board-motion";

describe("flipSeedOffsets", () => {
  it("seeds zeros for an identity permutation (nobody moved)", () => {
    expect(flipSeedOffsets([60, 60, 60], [0, 1, 2], 12)).toEqual([0, 0, 0]);
  });

  it("matches the (slots moved) × (height + gap) formula for equal rows", () => {
    // Two 60px rows swapped, 12px gap: the climber (DOM 0, was slot 1) seeds +72, the slipper −72.
    expect(flipSeedOffsets([60, 60], [1, 0], 12)).toEqual([72, -72]);
  });

  it("is exact for UNEQUAL row heights (no equal-height assumption)", () => {
    // DOM order (post): X(80px, was slot 1) above Y(40px, was slot 0), gap 10.
    // Pre layout: Y at top (0), X below Y → X's pre top = 40 + 10 = 50; post tops: X 0, Y 90.
    // Seeds: X 50−0 = +50; Y 0−90 = −90.
    expect(flipSeedOffsets([80, 40], [1, 0], 10)).toEqual([50, -90]);
  });

  it("keeps a three-row multi-mover consistent (each seed = preTop − postTop)", () => {
    // DOM (post) order: B(50, was 1), C(70, was 2), A(60, was 0), gap 12.
    // Pre layout order by slot: A(60) → B(50) → C(70): tops A 0, B 72, C 134.
    // Post tops: B 0, C 62, A 144. Seeds: B +72, C +72, A −144.
    expect(flipSeedOffsets([50, 70, 60], [1, 2, 0], 12)).toEqual([72, 72, -144]);
  });

  it("fails safe on a length mismatch (a row failed to render): zero motion", () => {
    expect(flipSeedOffsets([60, 60], [1], 12)).toEqual([0, 0]);
  });

  it("handles an empty board", () => {
    expect(flipSeedOffsets([], [], 12)).toEqual([]);
  });
});
