/**
 * @file The Home scene: the Home screen, whose coin pill carries the counter, on the `ui` layer
 * every scene gets, and the music of Home and the board: one key, so Play does not restart it.
 */
import { defineScene } from "@core/kit";
import { homeScreen } from "./home-screen";

export const homeScene = defineScene("home", {
  bundle: "home",
  music: "ui.music.theme",
  layers: {},
  projections: [homeScreen]
});
