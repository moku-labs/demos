/**
 * @file What the three projections of the stage read from the state: plain items of a frozen table,
 * checked without a screen.
 */
import type { Player, Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import { describe, expect, it } from "vitest";
import { stageHills } from "../../views/hills";
import { stageHome } from "../../views/home-screen";
import { stageSky } from "../../views/sky";
import type { HomeItem } from "../../views/stage-items";
import { hillsOf, homeOf } from "../../views/stage-items";

/** The session while the Board shows. */
const onBoard: Session = { ...startingSession, screen: "board" };

/** A player who picked a level. */
function playerAt(level: Player["level"]): Player {
  return { ...startingPlayer, level };
}

describe("what the sky reads", () => {
  it("is one thing that never changes, so the sky is never drawn again", () => {
    const first = stageSky.from(startingPlayer, startingSession);

    expect(stageSky.from(playerAt("hard"), onBoard)).toBe(first);
    expect(stageSky.layer).toBe("background");
  });
});

describe("what the hills read", () => {
  it("is the same frozen object for the same screen, so a commit elsewhere leaves the hills alone", () => {
    const busy: Session = { ...onBoard, board: [1, 0, 0, 0, 2, 0, 0, 0, 0], turn: 1 };

    expect(hillsOf(busy)).toBe(hillsOf(onBoard));
    expect(hillsOf({ ...startingSession })).toBe(hillsOf(startingSession));
    expect(Object.isFrozen(hillsOf(onBoard))).toBe(true);
    expect(stageHills.from(startingPlayer, busy)).toBe(hillsOf(onBoard));
    expect(stageHills.layer).toBe("hills");
  });
});

describe("what Home reads", () => {
  it("is the saved level and its place in the picker while the screen is Home", () => {
    expect(homeOf(startingPlayer, startingSession)).toEqual([{ level: "normal", index: 1 }]);
    expect(homeOf(playerAt("hard"), startingSession)).toEqual([{ level: "hard", index: 2 }]);
    expect(homeOf(playerAt("easy"), startingSession)).toEqual([{ level: "easy", index: 0 }]);
  });

  it("is nothing while the Board shows", () => {
    expect(homeOf(startingPlayer, onBoard)).toEqual([]);
  });

  it("is the same frozen object for the same level, so a commit elsewhere cuts no motion short", () => {
    const [first] = homeOf(playerAt("hard"), startingSession);
    const scored: Player = { ...playerAt("hard"), score: { you: 3, draws: 1, bot: 2 } };

    expect(homeOf(scored, startingSession)[0]).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(stageHome.from(scored, startingSession)).toEqual([first]);
    expect(stageHome.key?.(first as HomeItem)).toBe("home");
    expect(stageHome.layer).toBe("ui");
  });
});
