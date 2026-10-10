/**
 * @file Transit node `boardIn`: clears the round in the session and picks who moves first.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";
import { clearRound } from "./round-state";

/**
 * Starts a round: an empty board, no result, the turn of whoever opens this round, and the saved
 * score on show. It ends with `human` or `bot`, after who moves first.
 */
export const boardIn = defineNode({
  outcomes: { human: type(), bot: type() },
  run: ({ player, session, out }) => {
    clearRound(session);
    session.turn = player.nextFirst;
    session.shownScore = { ...player.score };

    return player.nextFirst === 1 ? out.human() : out.bot();
  }
});
