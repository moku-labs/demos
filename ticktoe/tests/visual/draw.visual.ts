/**
 * @file A draw: one cell is left, then the round as it stands after the human took it and nobody
 * has a line. The picture is the celebration at rest, before the result card.
 */
import type { Player } from "@core/state";
import type { Board } from "@core/types";
import { defineVisualTest } from "@moku-labs/game/visual";
import { boardSession, celebrating, onBoard, scoredPlayer, settled } from "../helpers/visual";

/** X O X / X O O / O X and one free cell, 8. */
const lastCell: Board = [1, 2, 1, 1, 2, 2, 2, 1, 0];

const before = scoredPlayer();
const stage = onBoard("round/humanTurn", before, boardSession(lastCell, before));

/** The board after X took cell 8: full, and no line. */
const full: Board = [1, 2, 1, 1, 2, 2, 2, 1, 1];

/** The draw is counted and the bot opens the next round; the score row still shows the old score. */
const after: Player = { level: "normal", score: { you: 2, draws: 2, bot: 1 }, nextFirst: 2 };
const session = boardSession(full, before, { turn: 2, result: "draw", winLine: [] });

export const draw = defineVisualTest("draw", {
  start: stage.start,
  steps: [...stage.enter, celebrating(after, session), settled, { checkpoint: "full" }]
});
