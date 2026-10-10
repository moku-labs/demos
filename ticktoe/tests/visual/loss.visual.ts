/**
 * @file A loss: the bot has O on cells 3 and 4, then the round as it stands after the human took
 * cell 1 instead of blocking and the bot took cell 5. The picture is the celebration at rest,
 * before the result card.
 */
import type { Player } from "@core/state";
import type { Board } from "@core/types";
import { defineVisualTest } from "@moku-labs/game/visual";
import { boardSession, celebrating, onBoard, scoredPlayer, settled } from "../helpers/visual";

/** X on cells 0 and 6, O on 3 and 4: the bot wins at 5 unless the human takes it. */
const unblocked: Board = [1, 0, 0, 2, 2, 0, 1, 0, 0];

const before = scoredPlayer();
const stage = onBoard("round/humanTurn", before, boardSession(unblocked, before));

/** The human took cell 1, the bot cell 5: O holds the row 3, 4, 5. */
const lost: Board = [1, 1, 0, 2, 2, 2, 1, 0, 0];

/** The loss is counted and the bot opens the next round; the score row still shows the old score. */
const after: Player = { level: "normal", score: { you: 2, draws: 1, bot: 2 }, nextFirst: 2 };
const session = boardSession(lost, before, { turn: 1, result: "loss", winLine: [3, 4, 5] });

export const loss = defineVisualTest("loss", {
  start: stage.start,
  steps: [...stage.enter, celebrating(after, session), settled, { checkpoint: "line" }]
});
