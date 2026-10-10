/**
 * @file Transit node `splashIntro`: plays the entrance of the splash and arms its minimum time.
 */
import { defineNode, play } from "@core/kit";
import { tables } from "@core/tables";
import { schedule, type } from "@moku-labs/game";
import { splashEntrance } from "../motion/animations";

/**
 * The first node of the game. It mounts the scene `splash`, starts the splash from nothing, plays
 * the entrance and asks the clock for the end of the minimum time. `now` is the moment the node
 * was entered, so the minimum time counts from the start of the entrance. The moment is kept in
 * the session: `markMinTime` tells the `elapsed` it asked for from an earlier one by it.
 */
export const splashIntro = defineNode({
  scene: "splash",
  outcomes: { done: type() },
  run: async ({ session, fx, now, out }) => {
    const minDueAt = now + tables.splash.minMs;

    session.splash = { pct: 0, ready: false, minPassed: false, minDueAt };

    await fx(play(splashEntrance, {}));
    await fx(schedule(minDueAt));

    return out.done();
  }
});
