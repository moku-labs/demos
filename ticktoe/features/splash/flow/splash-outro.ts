/**
 * @file Transit node `splashOutro`: plays the exit of the splash.
 */
import { defineNode, play } from "@core/kit";
import { type } from "@moku-labs/game";
import { splashExit } from "../motion/animations";

/**
 * The last node of the splash. It plays the exit; the edge after it leads to Home, which mounts
 * the scene `stage`.
 */
export const splashOutro = defineNode({
  outcomes: { done: type() },
  run: async ({ fx, out }) => {
    await fx(play(splashExit, {}));

    return out.done();
  }
});
