/**
 * @file The result card over a won round: X on the diagonal 0, 4, 8, the win counted, the score
 * row caught up, and the bot to open the next round.
 */
import type { Player } from "@core/state";
import type { Board } from "@core/types";
import { defineVisualTest } from "@moku-labs/game/visual";
import { boardSession, onBoard } from "../helpers/visual";

/** The mid-game board after X took cell 8. */
const won: Board = [1, 0, 2, 2, 1, 0, 0, 0, 1];

const player: Player = { level: "normal", score: { you: 3, draws: 1, bot: 1 }, nextFirst: 2 };
const session = boardSession(won, player, {
  turn: 2,
  result: "win",
  winLine: [0, 4, 8],
  card: true
});
const stage = onBoard("round/roundEnd/resultCard", player, session);

export const result = defineVisualTest("result", {
  start: stage.start,
  steps: [...stage.enter, { checkpoint: "card" }]
});
