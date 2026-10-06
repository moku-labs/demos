/**
 * @file What every tool of the demo needs to run against an engine working tree instead of the
 * installed package: where that tree is, and which entries it has. The runner (`scripts/run.ts`)
 * takes the tree from `--engine <path>` and hands it on in `MOKU_ENGINE_SRC`. The vitest config,
 * the Bun preload and the bundler plugin of the dev page read it from there. An editor working
 * tree of `--editor <path>` goes the same way in `MOKU_EDITOR_ROOT`, for the editor scenarios: its
 * built entries replace `@moku-labs/editor`. No path is written down anywhere: with no variable,
 * every tool uses `node_modules` as is.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The variable the runner sets to the absolute path of an engine working tree. */
export const ENGINE_SRC_ENV = "MOKU_ENGINE_SRC";

/** The variable the runner sets to the absolute path of an editor working tree. */
export const EDITOR_ROOT_ENV = "MOKU_EDITOR_ROOT";

/** Packages the engine and the demo must share one copy of: two Pixis or two cores break. */
export const SHARED_PACKAGES = ["pixi.js", "@moku-labs/core", "@moku-labs/common"] as const;

/**
 * Packages an editor working tree and the demo must share one copy of: the engine the editor
 * reads, and the preact the scenarios' `act` flushes.
 */
export const EDITOR_SHARED_PACKAGES = [...SHARED_PACKAGES, "@moku-labs/game", "preact"] as const;

/** The folder of the demo: the shared packages resolve from its `node_modules`. */
export const demoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * The engine working tree the runner picked, `undefined` for the installed package.
 *
 * @returns The absolute path of the tree, or `undefined`.
 */
export function engineSrc(): string | undefined {
  const value = process.env[ENGINE_SRC_ENV];

  return value === undefined || value === "" ? undefined : value;
}

/**
 * Lists the entries of the engine at a working tree, from the `exports` of its package.json:
 * `"."` is `index`, `"./visual"` is `visual`. A pattern export (`./fonts/*`) is a folder of files,
 * not an entry.
 *
 * @param root - The engine working tree.
 * @returns The entry names, such as `["index", "testing", "visual"]`.
 */
export function engineEntries(root: string): string[] {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    exports: Record<string, unknown>;
  };

  return Object.keys(manifest.exports)
    .filter(key => !key.includes("*"))
    .map(key => (key === "." ? "index" : key.slice(2)));
}

/**
 * The source file of one engine entry in a working tree.
 *
 * @param root - The engine working tree.
 * @param entry - The entry name, `index` for the package root.
 * @returns The absolute path of the `.ts` file.
 */
export function entrySource(root: string, entry: string): string {
  return path.join(root, "src", `${entry}.ts`);
}

/**
 * Maps an import of the engine to its entry name.
 *
 * @param specifier - The import, such as `@moku-labs/game/testing`.
 * @returns The entry name, or `undefined` when the import is not an engine entry.
 */
export function entryOf(specifier: string): string | undefined {
  if (specifier === "@moku-labs/game") return "index";

  return specifier.startsWith("@moku-labs/game/")
    ? specifier.slice("@moku-labs/game/".length)
    : undefined;
}

/**
 * Tells whether an import names one of the shared packages or a subpath of one.
 *
 * @param specifier - The import.
 * @returns True for `pixi.js`, `@moku-labs/core`, `@moku-labs/common/cli` and the like.
 */
export function isShared(specifier: string): boolean {
  return SHARED_PACKAGES.some(name => specifier === name || specifier.startsWith(`${name}/`));
}

/**
 * The editor working tree the runner picked, `undefined` for the installed package.
 *
 * @returns The absolute path of the tree, or `undefined`.
 */
export function editorRoot(): string | undefined {
  const value = process.env[EDITOR_ROOT_ENV];

  return value === undefined || value === "" ? undefined : value;
}

/**
 * Maps every entry of an editor working tree to its built file, from the `exports` of its
 * package.json: `"./agent"` is `@moku-labs/editor/agent`.
 *
 * @param root - The editor working tree, built.
 * @returns The import and the absolute path of its file, such as
 *   `{ "@moku-labs/editor/agent": "<root>/dist/agent.mjs" }`.
 */
export function editorEntries(root: string): Record<string, string> {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    exports: Record<string, { default?: string } | string>;
  };

  return Object.fromEntries(
    Object.entries(manifest.exports).map(([key, target]) => [
      key === "." ? "@moku-labs/editor" : `@moku-labs/editor/${key.slice(2)}`,
      path.join(root, typeof target === "string" ? target : (target.default ?? ""))
    ])
  );
}

/**
 * Tells whether an import names a package the editor tree must share with the demo.
 *
 * @param specifier - The import.
 * @returns True for `preact/hooks`, `@moku-labs/game/inspect`, `pixi.js` and the like.
 */
export function isEditorShared(specifier: string): boolean {
  return EDITOR_SHARED_PACKAGES.some(
    name => specifier === name || specifier.startsWith(`${name}/`)
  );
}
