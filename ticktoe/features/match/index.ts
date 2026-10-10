/**
 * @file The feature `match`: one round of tic-tac-toe and everything the Board shows.
 */
import { defineFeature } from "@core/kit";
import { matchAssets } from "./assets";
import { roundFlow } from "./flow/round";
import { roundEndFlow } from "./flow/round-end";
import {
  boardExit,
  boardReset,
  cardIn,
  drawSoundO,
  drawSoundX,
  headShake,
  landO,
  landX,
  lossSound,
  winSound
} from "./motion/animations";
import { confetti } from "./motion/effects";
import { matchCard } from "./views/card";
import { matchHud } from "./views/hud";
import { matchPieces } from "./views/pieces";
import { matchTray } from "./views/tray";

export { roundFlow } from "./flow/round";
export { clearRound } from "./flow/round-state";
export { matchCard } from "./views/card";
export { matchHud } from "./views/hud";
export { matchPieces } from "./views/pieces";
export { matchTray } from "./views/tray";

/**
 * The feature `match`: the flows `round` and `roundEnd`, the four projections of the Board, the
 * three timelines a node awaits, the seven that hold a sound until its moment, the confetti and
 * the bundle `match`.
 */
export const matchFeature = defineFeature("match", {
  flows: [roundFlow, roundEndFlow],
  projections: [matchHud, matchTray, matchPieces, matchCard],
  animations: [
    headShake,
    boardReset,
    boardExit,
    landX,
    landO,
    cardIn,
    winSound,
    lossSound,
    drawSoundX,
    drawSoundO
  ],
  emitters: [confetti],
  assets: matchAssets
});
