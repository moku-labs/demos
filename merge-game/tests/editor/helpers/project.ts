/**
 * @file The temp folders of the editor scenarios: the project root the files plugin serves (a
 * copy of the demo's game), the tools page folder pages serves, and the list `shutdown` removes.
 */
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MERGE_GAME_DIR } from "./game-dir";

/** Every temp folder made in this test file, removed by `removeTemps`. */
const temps: string[] = [];

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
 * Creates a project root in a fresh temp folder (its real path): a copy of the demo's game files,
 * so writes never touch the demo. What only the demo has (its tooling, tests and outputs) stays
 * behind, so the copy holds the same files as the game folder the editor tests were written on.
 *
 * @param kind - Which project: the merge game.
 * @returns The absolute real path of the root.
 */
export async function createProject(kind: "merge"): Promise<string> {
  const root = await makeTemp(`moku-root-${kind}-`);
  await cp(MERGE_GAME_DIR, root, { recursive: true, filter: source => isGameFile(source) });
  return root;
}

/** The top-level entries of the demo that are not the game: its tooling, tests and outputs. */
const NOT_GAME = new Set([
  ".bun-version",
  ".gitignore",
  ".moku",
  "CLAUDE.md",
  "README.md",
  "bun.lock",
  "dist",
  "node_modules",
  "package.json",
  "scripts",
  "tests",
  "tsconfig.json",
  "vitest.config.ts"
]);

/**
 * True for a file or folder of the demo that belongs to the game.
 *
 * @param source - An absolute path under the demo folder.
 * @returns Whether the copy takes it.
 */
function isGameFile(source: string): boolean {
  const [top = ""] = path.relative(MERGE_GAME_DIR, source).split(path.sep);
  return !NOT_GAME.has(top);
}

/** The tools page template: the shape of `TEMPLATE` in the pages plugin tests. */
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
  const dir = await makeTemp("moku-page-");
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
