/**
 * @file Transit node `leaveBoard`: cancels a pending pause, plays the Board exit and returns to Home.
 */
import { defineNode, play, sfx } from "@core/kit";
import { schedule, type } from "@moku-labs/game";
import { boardExit } from "../motion/animations";
import { exitTargets } from "../names";
import { clearRound } from "./round-state";

/**
 * Leaves the Board: the Home button taps, a pending pause is cancelled and the exit of what is on
 * the screen plays. Then it clears the round and switches the screen to Home, and the whoosh
 * starts with the hills that slide back. The saved score stays.
 */
export const leaveBoard = defineNode({
  outcomes: { done: type() },
  run: async ({ session, fx, out }) => {
    // Only a Home button leads here: of the Board, or of the card. No sound is awaited.
    void fx(sfx("ui.tap"));
    // oxlint-disable-next-line unicorn/no-useless-undefined -- the engine cancels the pending pause with schedule(undefined)
    await fx(schedule(undefined));
    await fx(play(boardExit, exitTargets(session)));

    clearRound(session);
    session.screen = "home";
    // The hills slide when this edge commits. Not awaited either.
    void fx(sfx("match.whoosh"));

    return out.done();
  }
});
