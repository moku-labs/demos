/**
 * @file Transit node `resetBoard`: plays the board reset before a new round.
 */
import { defineNode, play, sfx } from "@core/kit";
import { type } from "@moku-labs/game";
import { boardReset } from "../motion/animations";
import { resetTargets } from "../names";

/**
 * Play again: the button taps, then the board reset plays over what the result card shows. The
 * next round then starts on a Board that is already clean.
 */
export const resetBoard = defineNode({
  outcomes: { done: type() },
  run: async ({ session, fx, out }) => {
    // Only Play again leads here. Not awaited: the reset never waits for the tap.
    void fx(sfx("ui.tap"));
    await fx(play(boardReset, resetTargets(session)));

    return out.done();
  }
});
