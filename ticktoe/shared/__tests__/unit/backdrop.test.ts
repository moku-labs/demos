/**
 * @file The backdrop every screen stands on: the one rule its numbers must keep. A hill strip
 * covers the stage and the margins of a tablet wherever its slide stands.
 */
import { describe, expect, it } from "vitest";
import { hills, STRIP, stage } from "../../styles/backdrop";

/** The widest window a hill strip must still cover: a 3:4 tablet, 180 units past each side. */
const margin = 180;

/** The three hill layers, back to front. */
const layers = [hills.back, hills.mid, hills.front];

describe("the hill strips", () => {
  it("covers the stage and a tablet's margins at both ends of the slide", () => {
    for (const hill of layers) {
      for (const left of [hill.left, hill.left + hill.travel]) {
        expect(left).toBeLessThanOrEqual(-margin);
        expect(left + STRIP.width).toBeGreaterThanOrEqual(stage.width + margin);
      }
    }
  });
});
