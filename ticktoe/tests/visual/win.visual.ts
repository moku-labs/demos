/**
 * @file A win: the mid-game board, then the round as it stands after the human took cell 8 and X
 * holds the diagonal 0, 4, 8. The picture is the celebration at rest, before the result card.
 */
import type { Player } from "@core/state";
import type { Board } from "@core/types";
import { defineVisualTest } from "@moku-labs/game/visual";
import {
  boardSession,
  celebrating,
  midGame,
  onBoard,
  scoredPlayer,
  settled
} from "../helpers/visual";

const before = scoredPlayer();
const stage = onBoard("round/humanTurn", before, boardSession(midGame, before));

/** The mid-game board after X took cell 8. */
const won: Board = [1, 0, 2, 2, 1, 0, 0, 0, 1];

/** The win is counted and the bot opens the next round; the score row still shows the old score. */
const after: Player = { level: "normal", score: { you: 3, draws: 1, bot: 1 }, nextFirst: 2 };
const session = boardSession(won, before, { turn: 2, result: "win", winLine: [0, 4, 8] });

export const win = defineVisualTest("win", {
  start: stage.start,
  steps: [...stage.enter, celebrating(after, session), settled, { checkpoint: "line" }]
});
