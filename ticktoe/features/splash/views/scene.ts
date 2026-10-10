/**
 * @file The scene `splash`: its boot bundle and its one screen.
 */
import { defineScene } from "@core/kit";
import { splashScreen } from "./splash-screen";

/**
 * The scene of the splash. Its bundle is tier "boot", so the art is there before the graph runs.
 * It declares no layer of its own: the one screen draws on the layer `ui`.
 */
export const splashScene = defineScene("splash", {
  bundle: "splash",
  layers: {},
  projections: [splashScreen]
});
