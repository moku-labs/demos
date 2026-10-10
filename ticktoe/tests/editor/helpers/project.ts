/**
 * @file The temp folders of the editor scenarios: the project root the files plugin serves (a
 * copy of the game), the tools page folder pages serves, and the list `shutdown` removes.
 */
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GAME_DIR } from "./game-dir";

/** Every temp folder made in this test file, removed by `removeTemps`. */
const temps: string[] = [];

/**
 * The game: its three root files, its `tsconfig.json` and its layers. The `paths` of the tsconfig
 * name the layer aliases (`@core/*`, `@shared`, `@features/*`) the project index follows. Nothing
 * else of the folder is copied: no tooling, no tests, no output, no local file.
 */
const GAME_ENTRIES = [
  "index.ts",
  "config.ts",
  "game.ts",
  "tsconfig.json",
  "core",
  "shared",
  "features",
  "plugins",
  "generated"
];

/**
 * Makes a fresh temp folder and remembers it for `removeTemps`.
 *
 * @param prefix - The folder name prefix.
 * @returns The real path of the folder.
 */
async function makeTemp(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
  temps.push(dir);
  return dir;
}

/**
 * Writes one file, creating its folders.
 *
 * @param root - The base folder.
 * @param relative - The file path under `root`.
 * @param text - The content.
 * @returns Resolves when written.
 */
async function put(root: string, relative: string, text: string): Promise<void> {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/**
 * Creates a project root in a fresh temp folder (its real path): a copy of the game, so a write of
 * the editor (a capture, a card) never touches the game.
 *
 * @returns The absolute real path of the root.
 */
export async function createProject(): Promise<string> {
  const root = await makeTemp("ticktoe-editor-root-");
  for (const entry of GAME_ENTRIES) {
    await cp(path.join(GAME_DIR, entry), path.join(root, entry), { recursive: true });
  }
  return root;
}

/** The tools page template: the shape of the page the pages plugin serves. */
const PAGE_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>moku editor</title>
    <link rel="stylesheet" crossorigin href="./assets/index.css">
  </head>
  <body><div data-editor-root></div></body>
</html>
`;

/**
 * Creates a built-page folder for pages: `index.html` with `<div data-editor-root>` and two
 * assets (`assets/app.js`, `assets/index.css`).
 *
 * @returns The absolute real path of the folder.
 */
export async function createPageDir(): Promise<string> {
  const dir = await makeTemp("ticktoe-editor-page-");
  await put(dir, "index.html", PAGE_TEMPLATE);
  await put(dir, "assets/app.js", "export {};\n");
  await put(dir, "assets/index.css", "body{margin:0}\n");
  return dir;
}

/**
 * Removes every temp folder made so far in this test file.
 *
 * @returns Resolves when they are gone.
 */
export async function removeTemps(): Promise<void> {
  const dirs = temps.splice(0);
  await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })));
}
