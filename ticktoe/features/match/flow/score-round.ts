/**
 * @file Transit node `scoreRound`: writes the score and the next first mover, then arms the celebration.
 */
import { defineNode, play } from "@core/kit";
import { tables } from "@core/tables";
import type { Mark } from "@core/types";
import { schedule, type } from "@moku-labs/game";
import { drawSoundO, drawSoundX, lossSound, winSound } from "../motion/animations";
import { lastMover } from "../rules";

/**
 * The score a finished round adds one to.
 */
const SCORE_OF = { win: "you", loss: "bot", draw: "draws" } as const;

/**
 * The timeline that holds the sound of a result until the last piece touches its tile. A win is
 * ended by the human's X and a loss by the bot's O, so the result names the piece. A draw is ended
 * by either, so the mark of the last piece picks its timeline.
 *
 * @param result - How the round ended.
 * @param last - The mark of the piece that ended it.
 * @returns The timeline to start.
 */
function resultSound(result: "win" | "loss" | "draw", last: Mark) {
  if (result === "win") return winSound;
  if (result === "loss") return lossSound;

  return last === 1 ? drawSoundX : drawSoundO;
}

/**
 * Counts a finished round: one more win, loss or draw for the saved player, and the other player
 * opens the next round. Then it starts the timeline that holds the sound of the result until the
 * last piece has landed, and arms the end of the celebration.
 */
export const scoreRound = defineNode({
  input: type<{ result: "win" | "loss" | "draw" }>(),
  outcomes: { done: type() },
  run: async ({ input, player, session, now, fx, out }) => {
    player.score[SCORE_OF[input.result]] += 1;
    player.nextFirst = player.nextFirst === 1 ? 2 : 1;
    session.celebrateDueAt = now + tables.celebrateMs[input.result];
    // Not awaited: the celebration never waits for its sound. Started before the clock is armed,
    // so its wait counts from the last move, as the drop of the piece does.
    void fx(play(resultSound(input.result, lastMover(session.turn)), {}));
    await fx(schedule(session.celebrateDueAt));

    return out.done();
  }
});
