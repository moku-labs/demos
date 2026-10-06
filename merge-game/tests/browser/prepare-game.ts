/**
 * @file The e2e game build step: copies the demo's game into `.moku/editor-e2e/game/` (gitignored),
 * puts the e2e game page (`game/editor.html` and `game/editor.ts`: the demo page plus the editor
 * agent) into its `web/` folder and writes the copy's tsconfig, bunfig and package.json.
 *
 * The copy is the project root the bin serves, so the editor's writes (notes, layout, styles,
 * captures) land in `.moku/`, never in the demo, and every run starts from the same files. The
 * copy sits inside the demo, so every package it imports resolves from the demo's node_modules:
 * `@moku-labs/game` (the pin or `--engine <x>`), `@moku-labs/editor/agent`, `@moku-labs/system`,
 * `@moku-labs/native` and `typescript`, which the bin's project index needs.
 *
 * The copy's bunfig loads the same Bun preload and dev-server plugins as the demo's own, from the
 * demo's `scripts/`: with `--engine <path>` the page bundles the engine from that tree, with
 * `--editor <path>` it takes `@moku-labs/editor/agent` from that tree's build. With neither they do
 * nothing. The bin re-runs itself in the copy, where Bun reads that bunfig.
 *
 * The copy's tsconfig extends the demo's and repeats its `paths`: a `paths` entry resolves against
 * the config that declares it, so the layer aliases (`@core/*`, `@shared`, `@features/*`) of the
 * copy land on the copy's files, not on the demo's.
 *
 * The copy gets its own package.json, as a game project has: the bin's bundler reads it, and the
 * Files specs check that a link out of the root lands on it.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MERGE_GAME_DIR } from "../editor/helpers/game-dir";

/** This folder: the e2e page files sit in `game/`. */
const HERE = fileURLToPath(new URL(".", import.meta.url));

/** The e2e output folder. */
const OUT_DIR = path.join(MERGE_GAME_DIR, ".moku", "editor-e2e");

/** The copy the bin serves. */
const OUT = path.join(OUT_DIR, "game");

/** The top-level entries of the demo that are not the game: its tooling, tests and outputs. */
const NOT_GAME = new Set([
  ".bun-version",
  ".gitignore",
  ".moku",
  "CLAUDE.md",
  "README.md",
  "bun.lock",
  "bunfig.toml",
  "dist",
  "node_modules",
  "package.json",
  "scripts",
  "tests",
  "tsconfig.json",
  "vitest.config.ts"
]);

/**
 * True for a file or folder of the demo that the copy takes: the game, without unit tests.
 *
 * @param source - An absolute path under the demo folder.
 * @returns Whether the copy takes it.
 */
function isGameFile(source: string): boolean {
  const relative = path.relative(MERGE_GAME_DIR, source);
  const [top = ""] = relative.split(path.sep);
  return !NOT_GAME.has(top) && !relative.split(path.sep).includes("__tests__");
}

/** The way back from the copy to the demo folder, for the copy's tsconfig and bunfig. */
const UP = path.relative(OUT, MERGE_GAME_DIR).split(path.sep).join("/");

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
// The copy sits inside the demo, so the demo is copied entry by entry, never as a whole.
for (const entry of await readdir(MERGE_GAME_DIR)) {
  const source = path.join(MERGE_GAME_DIR, entry);
  if (!isGameFile(source)) continue;
  await cp(source, path.join(OUT, entry), {
    recursive: true,
    filter: file => isGameFile(file)
  });
}
for (const file of ["editor.html", "editor.ts"]) {
  await cp(path.join(HERE, "game", file), path.join(OUT, "web", file));
}
const demoConfigText = await readFile(path.join(MERGE_GAME_DIR, "tsconfig.json"), "utf8");
const demoConfig = JSON.parse(demoConfigText) as {
  compilerOptions: { paths: Record<string, string[]> };
};
await writeFile(
  path.join(OUT, "tsconfig.json"),
  `${JSON.stringify(
    { extends: `${UP}/tsconfig.json`, compilerOptions: { paths: demoConfig.compilerOptions.paths } },
    undefined,
    2
  )}\n`
);
await writeFile(
  path.join(OUT, "bunfig.toml"),
  [
    `preload = ["${UP}/scripts/engine-src.ts"]`,
    "",
    "[serve.static]",
    `plugins = ["@moku-labs/game/hot", "${UP}/scripts/engine-bundle.ts"]`,
    ""
  ].join("\n")
);
await writeFile(
  path.join(OUT, "package.json"),
  `${JSON.stringify({ name: "merge-game-e2e", private: true, type: "module" }, undefined, 2)}\n`
);
