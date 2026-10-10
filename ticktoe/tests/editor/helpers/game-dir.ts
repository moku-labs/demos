/**
 * @file Where the editor scenarios find the game: this folder itself. The path is resolved from
 * this file's own place inside the game (`tests/editor/helpers/`), so it never names a machine
 * path. Writes of a scenario never land here: every scenario copies the game into a temp folder.
 */
import { fileURLToPath } from "node:url";

/** The game folder. */
export const GAME_DIR = fileURLToPath(new URL("../../../", import.meta.url));
