/**
 * @file Transit node `checkEnd`: decides whether the round is over and who moves next.
 */
import { defineNode } from "@core/kit";
import { type } from "@moku-labs/game";
import { resultOf, winnerOf } from "../rules";

/**
 * Looks at the board after a move. A finished round gets its result and its line written and ends
 * with `over`; else the turn goes on to the human or to the bot.
 */
export const checkEnd = defineNode({
  outcomes: {
    over: type<{ result: "win" | "loss" | "draw" }>(),
    nextHuman: type(),
    nextBot: type()
  },
  run: ({ session, out }) => {
    const result = resultOf(session.board);

    if (result === "none") return session.turn === 1 ? out.nextHuman() : out.nextBot();

    session.result = result;
    session.winLine = winnerOf(session.board).line;

    return out.over({ result });
  }
});
