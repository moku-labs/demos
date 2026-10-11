/**
 * @file What the three projections of the stage read from the state: plain items, checked without
 * a screen.
 */
import type { Player, Session } from "@core/state";
import { startingPlayer, startingSession } from "@core/state";
import { describe, expect, it } from "vitest";
import { stageHills } from "../../views/hills";
import { stageHome } from "../../views/home-screen";
import { stageSky } from "../../views/sky";
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
  it("is the screen that shows and nothing else, whatever the round holds", () => {
    const busy: Session = { ...onBoard, board: [1, 0, 0, 0, 2, 0, 0, 0, 0], turn: 1 };

    expect(hillsOf(startingSession)).toEqual({ screen: "home" });
    expect(hillsOf(onBoard)).toEqual({ screen: "board" });
    expect(hillsOf(busy)).toEqual({ screen: "board" });
    expect(stageHills.from(startingPlayer, busy)).toEqual({ screen: "board" });
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

  it("is the level and nothing else of the save: a score changes nothing", () => {
    const scored: Player = { ...playerAt("hard"), score: { you: 3, draws: 1, bot: 2 } };

    expect(homeOf(scored, startingSession)).toEqual([{ level: "hard", index: 2 }]);
    expect(stageHome.from(scored, startingSession)).toEqual([{ level: "hard", index: 2 }]);
    expect(stageHome.key?.({ level: "hard", index: 2 })).toBe("home");
    expect(stageHome.layer).toBe("ui");
  });
});
