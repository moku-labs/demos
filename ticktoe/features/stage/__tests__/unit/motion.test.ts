/**
 * @file The branches of the stage's motion hooks no screen test reaches, called on a stub view
 * that records what the hook asked for: a word, the level knob and a hill layer that have no rest
 * pose or no marker yet.
 */
import { describe, expect, it } from "vitest";
import { placeHill, slideHill } from "../../motion/hills-motion";
import { dropIn, placeKnob, slideKnob } from "../../motion/home-motion";
import { slot } from "../../styles/layout";
import { restAt, stubView } from "../fixtures/stub-view";

describe("the title words", () => {
  it("stay where the layout put them while they have no rest pose yet", () => {
    const { view, calls } = stubView();

    expect(dropIn(1)(view)).toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe("the level knob", () => {
  it("appears under the first level while it carries no marker", () => {
    const { view, sets } = stubView(restAt(148, 85));

    placeKnob(view);

    expect(sets("Transform")[0]?.patch).toEqual({ x: 148 });
  });

  it("counts from the left edge while the layout has given it no rest pose yet", () => {
    const { view, sets, tweens } = stubView({}, { LevelKnob: { index: 1 } });

    placeKnob(view);
    slideKnob(view, { index: 1 }, { index: 2 });

    expect(sets("Transform")[0]?.patch).toEqual({ x: slot.width });
    expect(tweens("Transform")[0]?.to).toEqual({ x: 2 * slot.width });
  });
});

describe("the hills", () => {
  it("appear at the end of the screen that shows, with no slide", () => {
    const home = stubView(restAt(-60, 960), { Parallax: { at: 0 } });
    const board = stubView(restAt(-60, 960), { Parallax: { at: 1 } });
    const bare = stubView(restAt(-60, 960));

    expect(placeHill(400)(home.view)).toBeUndefined();
    placeHill(400)(board.view);
    placeHill(400)(bare.view);

    expect(home.calls).toEqual([{ op: "set", component: "Transform", patch: { x: -60 } }]);
    expect(board.calls).toEqual([{ op: "set", component: "Transform", patch: { x: 340 } }]);
    expect(bare.calls).toEqual([{ op: "set", component: "Transform", patch: { x: -60 } }]);
  });

  it("count from the left edge while the layout has given them no rest pose yet", () => {
    const { view, sets, tweens } = stubView({}, { Parallax: { at: 1 } });

    placeHill(400)(view);
    slideHill(400, 620)(view, { at: 1 }, { at: 0 });

    expect(sets("Transform")[0]?.patch).toEqual({ x: 400 });
    expect(tweens("Transform")[0]?.to).toEqual({ x: 0 });
  });
});
