/**
 * @file The visual tests as `moku-game visual` reads them: the app of the headless leg and the tests.
 */
import game from "../../index";
import { diskIo, diskManifest } from "../helpers/disk-io";
import { board } from "./board.visual";
import { draw } from "./draw.visual";
import { home } from "./home.visual";
import { loss } from "./loss.visual";
import { result } from "./result.visual";
import { splash } from "./splash.visual";
import { win } from "./win.visual";

export default {
  // The real manifest and font, so the text boxes of `describe.json` are the page's.
  app: { app: () => game.screen({ manifest: diskManifest(), io: diskIo() }).app },
  tests: [splash, home, board, win, loss, draw, result]
};
