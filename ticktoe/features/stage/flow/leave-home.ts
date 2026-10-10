/**
 * @file Transit node `leaveHome`: plays the Home exit and switches the screen to the Board.
 */
import { defineNode, play, sfx } from "@core/kit";
import { type } from "@moku-labs/game";
import { homeExit } from "../motion/animations";

/**
 * Leaves Home: Play taps and the parts of Home pop away, then the screen becomes the Board and
 * the score row is told the saved score. The Board arrives by the `enter` hooks of its own views,
 * and the hills slide by theirs: the whoosh starts with them.
 */
export const leaveHome = defineNode({
  outcomes: { done: type() },
  run: async ({ player, session, fx, out }) => {
    // Only Play leads here. Not awaited: the exit never waits for the tap.
    void fx(sfx("ui.tap"));
    await fx(play(homeExit, {}));

    session.screen = "board";
    session.shownScore = { ...player.score };
    // The hills slide when this edge commits. Not awaited either.
    void fx(sfx("match.whoosh"));

    return out.done();
  }
});
