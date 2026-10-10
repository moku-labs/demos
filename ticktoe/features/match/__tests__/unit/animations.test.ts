/**
 * @file The one branch of the Board's timelines no screen test reaches: a board reset that is
 * handed fewer than nine faces. The timeline is built with stub targets and its step tree is read.
 */
import type { Anim } from "@moku-labs/game";
import { describe, expect, it } from "vitest";
import { boardReset } from "../../motion/animations";

/** A target by key: every stub target of this file sits in one projection. */
function key(name: string): Anim.Target {
  return { projection: "stub", key: name };
}

/** Where every stub target rests: far from zero, so an offset is told from a place. */
const REST = { x: 500, y: 700, rotation: 0, scale: 1 };

/** A step with the fields this file reads. */
type Step = { kind: string; steps?: Step[] };

/** Reads a built step as plain data. */
function read(step: Anim.Step): Step {
  return step as unknown as Step;
}

/** Every step of a kind in a tree, in tree order. */
function everyStep(step: Step, kind: string): Step[] {
  const own = step.kind === kind ? [step] : [];

  return [...own, ...(step.steps ?? []).flatMap(part => everyStep(part, kind))];
}

describe("boardReset", () => {
  const faces = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(cell => key(`tile${cell}Face`));
  const pieces = [key("piece0Shadow"), key("piece0"), key("piece4Shadow"), key("piece4")];

  /** Builds the reset over the stub targets. */
  function build(list = pieces, faceList = faces) {
    return read(
      boardReset.build(
        { card: key("cardGroup"), tray: key("tray"), pieces: list, faces: faceList },
        { at: () => REST }
      )
    );
  }

  it("leaves out a face it was not given", () => {
    expect(everyStep(build(pieces, faces.slice(0, 4)), "set")).toHaveLength(4);
  });
});
