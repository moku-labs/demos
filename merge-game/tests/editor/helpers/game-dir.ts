/**
 * @file Where the editor scenarios find the merge game: this demo folder itself. The path is
 * resolved from this file's own place inside the demo (`tests/editor/helpers/`), so it never
 * names a machine path. Writes of a scenario never land here: the vitest scenarios copy the game
 * into a temp folder, the Playwright specs into `.moku/editor-e2e/game` (e2e/prepare-game.ts).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The demo folder: the merge game's own files. */
export const GAME_DIR = fileURLToPath(new URL("../../../", import.meta.url));

/** The merge game folder. In the demo it is the demo folder. */
export const MERGE_GAME_DIR = GAME_DIR;

/**
 * The file URL of a file of the demo, for a run-time `import()`.
 *
 * @param relative - A path relative to the demo folder, with `/` separators.
 * @returns The `file://` URL of the file.
 */
export function gameFileUrl(relative: string): string {
  return pathToFileURL(path.join(GAME_DIR, relative)).href;
}
