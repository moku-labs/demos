/**
 * @file The Board mid-game with the human to move: X on cells 0 and 4, O on 2 and 3, and the
 * score row of a player who has played.
 */
import { defineVisualTest } from "@moku-labs/game/visual";
import { boardSession, midGame, onBoard, scoredPlayer } from "../helpers/visual";

const player = scoredPlayer();
const stage = onBoard("round/humanTurn", player, boardSession(midGame, player));

export const board = defineVisualTest("board", {
  start: stage.start,
  steps: [...stage.enter, { checkpoint: "mid" }]
});
