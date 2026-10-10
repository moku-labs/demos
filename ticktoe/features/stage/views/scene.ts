/**
 * @file The scene `stage`: the one scene the game lives in after the splash. It lists the Board's
 * projections too, so the sky and the hills persist between Home and the Board, and so does the
 * music.
 */
import { defineScene } from "@core/kit";
import { matchCard, matchHud, matchPieces, matchTray } from "@features/match";
import { stageHills } from "./hills";
import { stageHome } from "./home-screen";
import { stageSky } from "./sky";

/**
 * The scene of the game. Its layers are drawn bottom first: the sky, the hills, then the layer
 * `ui` every scene gets, where Home and the four projections of the Board draw. The sky and the
 * hills have a layer each, so the order of the two never depends on which was built first.
 *
 * The theme is the music of the scene: it is asked for when the scene mounts, begins with the
 * first touch of the player and loops through Home and every round. Its file is in the bundle the
 * scene mounts on, so it is loaded when it is asked for.
 */
export const stageScene = defineScene("stage", {
  bundle: "match",
  music: "match.theme",
  layers: { background: {}, hills: {} },
  // The hud is listed before the tray: roots of the `ui` layer draw in this order, and a piece that
  // drops into the top row must pass in front of the score row.
  projections: [stageSky, stageHills, stageHome, matchHud, matchTray, matchPieces, matchCard]
});
