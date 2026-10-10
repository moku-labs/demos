/**
 * @file The page of the game, as plain data: the title and the colour behind the canvas. `moku-game`
 * and the page read it; the game logic never does.
 */
import type { GameConfig } from "@moku-labs/game/app";

/**
 * The config of the page and of the native app: the title, the colour behind the canvas, the
 * portrait lock and the icon, the name and the identifier of the app, the system capabilities the
 * shell wires, a save in `localStorage`, and the shared layer scanned as the feature `ui`.
 */
export default {
  // `renderer.background` in `index.ts` is the same colour, as a number: the canvas clear colour.
  page: {
    title: "Tic Tac Toe",
    background: "#8BDCBF",
    orientation: "portrait",
    icons: { favicon: "assets/icon.png", appleTouch: "assets/icon.png" }
  },
  // The native app: `moku-game native` reads its name, its identifier and its icon from here.
  native: { name: "Tic Tac Toe", identifier: "com.mokulabs.ticktoe", icon: "assets/icon.png" },
  // What the shell wires for the game: pause and resume, and the back button of Android.
  system: ["lifecycle", "back"],
  save: "local",
  // The shared layer is scanned like a feature named `ui`: `shared/assets/font-body.fnt` is `ui.font-body`.
  assets: { layers: { shared: "ui" } }
} satisfies GameConfig;
